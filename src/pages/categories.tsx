import Head from 'next/head'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Layout from '@/components/Layout'
import { PlusIcon, EditIcon, TrashIcon, TagIcon, SearchIcon } from 'lucide-react'
import { db } from '@/lib/firebaseClient'
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, orderBy, writeBatch, limit, startAfter, type QueryDocumentSnapshot, type DocumentData } from 'firebase/firestore'
import { useAuth } from '@/contexts/AuthContext'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { RequireAuth } from '@/components/RequireAuth'
import { usePreferences } from '@/contexts/PreferencesContext'
import { useEnvironment } from '@/contexts/EnvironmentContext'
import { DEFAULT_CATEGORIES, getCategoryIcon } from '@/lib/defaultCategories'
import { getApiUrl } from '@/lib/config'

interface Category {
  id: string
  user_id: string
  name: string
  icon?: string
  type?: 'income' | 'expense'
  created_at: string
  is_default?: boolean
}

export default function CategoriesPage() {
  const router = useRouter()
  const { user } = useAuth()
  const { formatDate } = usePreferences()
  const { getCollection, currentEnvironment } = useEnvironment()
  const queryClient = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [newCategory, setNewCategory] = useState({ name: '', icon: '🏷️', type: 'expense' as 'income' | 'expense' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [editingIcon, setEditingIcon] = useState('')
  const [editingType, setEditingType] = useState<'income' | 'expense'>('expense')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [generatingEmoji, setGeneratingEmoji] = useState(false)

  // Handle query parameters from Quick Actions menu
  useEffect(() => {
    if (router.query.action === 'add') {
      setShowAdd(true)
      // Clean up URL
      router.replace('/categories', undefined, { shallow: true })
    }
  }, [router.query.action])

  const { data: categories = [], isLoading } = useQuery<Category[]>({
    queryKey: ['categories', user?.uid, currentEnvironment.id],
    enabled: !!user?.uid,
    queryFn: async () => {
      if (!user?.uid) return []
      const categoriesRef = getCollection('categories')
      const q = query(categoriesRef, orderBy('name', 'asc'))
      const snapshot = await getDocs(q)
      return snapshot.docs.map(doc => {
        const data = doc.data()
        return {
          id: doc.id,
          user_id: user.uid,
          name: data.name,
          icon: data.icon || getCategoryIcon(data.name),
          type: data.type || 'expense', // default to expense for backward compatibility
          created_at: data.created_at,
          is_default: data.is_default
        }
      }) as Category[]
    }
  })

  // Filter categories based on search term
  const filteredCategories = categories.filter(cat =>
    cat.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Separate by type
  const expenseCategories = filteredCategories.filter(cat => cat.type === 'expense')
  const incomeCategories = filteredCategories.filter(cat => cat.type === 'income')

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !newCategory.name.trim()) return
    setSaving(true)
    setError(null)
    try {
      // Check for duplicate category (case-insensitive, same type)
      const normalizedName = newCategory.name.trim().toLowerCase()
      const duplicate = categories.find(cat => 
        cat.name.toLowerCase().trim() === normalizedName && 
        (cat.type || 'expense') === newCategory.type
      )

      if (duplicate) {
        setError(`A ${newCategory.type} category with the name "${newCategory.name.trim()}" already exists.`)
        setSaving(false)
        return
      }

      const categoriesRef = getCollection('categories')
      await addDoc(categoriesRef, {
        name: newCategory.name.trim(),
        icon: newCategory.icon,
        type: newCategory.type,
        created_at: new Date().toISOString(),
        is_default: false
      })
      queryClient.invalidateQueries({ queryKey: ['categories', user.uid, currentEnvironment.id] })
      setNewCategory({ name: '', icon: '📦', type: 'expense' })
      setShowAdd(false)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to add'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!user) return
    try {
      const categoryDocRef = doc(getCollection('categories'), id)
      await deleteDoc(categoryDocRef)
      queryClient.invalidateQueries({ queryKey: ['categories', user.uid, currentEnvironment.id] })
    } catch (error) {
      console.error('Failed to delete category:', error)
    }
  }

  const handleEdit = (category: Category) => {
    setEditingId(category.id)
    setEditingName(category.name)
    setEditingIcon(category.icon || getCategoryIcon(category.name))
    setEditingType(category.type || 'expense')
  }

  const handleUpdate = async (id: string) => {
    if (!user || !editingName.trim()) return
    
    // Check for duplicate category (case-insensitive, same type, excluding current category)
    const normalizedName = editingName.trim().toLowerCase()
    const duplicate = categories.find(cat => 
      cat.id !== id &&
      cat.name.toLowerCase().trim() === normalizedName && 
      (cat.type || 'expense') === editingType
    )

    if (duplicate) {
      setError(`A ${editingType} category with the name "${editingName.trim()}" already exists.`)
      return
    }
    setSaving(true)
    setError(null)
    try {
      const existing = categories.find(c => c.id === id)
      const oldName = existing?.name || ''
      const newName = editingName.trim()

      const categoryDocRef = doc(getCollection('categories'), id)
      await updateDoc(categoryDocRef, {
        name: newName,
        icon: editingIcon,
        type: editingType
      })

      // If category name changed, update all associated expenses to use the new name.
      // This prevents renamed categories from appearing as "Other" in transaction lists.
      if (oldName && oldName !== newName) {
        const expensesRef = getCollection('expenses')
        let lastDoc: QueryDocumentSnapshot<DocumentData> | null = null
        const PAGE_SIZE = 500

        while (true) {
          const constraints: any[] = [where('category', '==', oldName), limit(PAGE_SIZE)]
          if (lastDoc) constraints.push(startAfter(lastDoc))
          const qExp = query(expensesRef, ...constraints)
          const snap = await getDocs(qExp)
          if (snap.empty) break

          const batch = writeBatch(db)
          snap.docs.forEach(d => {
            batch.update(d.ref, { category: newName })
          })
          await batch.commit()

          if (snap.docs.length < PAGE_SIZE) break
          lastDoc = snap.docs[snap.docs.length - 1]
        }
      }

      queryClient.invalidateQueries({ queryKey: ['categories', user.uid, currentEnvironment.id] })
      queryClient.invalidateQueries({ queryKey: ['expenses', user.uid, currentEnvironment.id] })
      setEditingId(null)
      setEditingName('')
      setEditingIcon('')
      setEditingType('expense')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to update'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditingName('')
    setEditingIcon('')
    setEditingType('expense')
  }

  const generateEmojiWithAI = async (categoryName: string, isEditing: boolean = false) => {
    if (!categoryName.trim()) {
      alert('Please enter a category name first')
      return
    }

    setGeneratingEmoji(true)
    try {
      const response = await fetch(getApiUrl('/api/ai/suggest-emoji'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': user?.uid || 'anonymous'
        },
        body: JSON.stringify({ categoryName: categoryName.trim() }),
      })

      if (!response.ok) {
        throw new Error('Failed to generate emoji')
      }

      const data = await response.json()
      if (data.emoji) {
        if (isEditing) {
          setEditingIcon(data.emoji)
        } else {
          setNewCategory(prev => ({ ...prev, icon: data.emoji }))
        }
      }
    } catch (error) {
      console.error('Error generating emoji:', error)
      alert('Failed to generate emoji. Please try again.')
    } finally {
      setGeneratingEmoji(false)
    }
  }

  return (
    <RequireAuth>
      <Head>
        <title>Categories - Expenso</title>
        <meta name="description" content="Manage your expense categories" />
      </Head>

      <Layout>
        <div className="max-w-4xl mx-auto px-4 lg:px-8 py-4 lg:py-8">
          {/* Header - Mobile Optimized */}
          <div className="mb-4 lg:mb-8">
            {/* Mobile Header */}
            <div className="lg:hidden">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-bold text-gray-900 dark:text-white">Categories</h1>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Organize expenses</p>
                </div>
                <button
                  onClick={() => setShowAdd(true)}
                  className="w-11 h-11 bg-primary-600 hover:bg-primary-700 rounded-full flex items-center justify-center shadow-lg"
                >
                  <PlusIcon className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>

            {/* Desktop Header */}
            <div className="hidden lg:flex lg:items-center lg:justify-between">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Categories</h1>
                <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mt-1 sm:mt-2">Organize your expenses with custom categories</p>
              </div>
              <button onClick={() => setShowAdd(true)} className="btn-primary inline-flex items-center justify-center w-full sm:w-auto">
                <PlusIcon className="w-4 h-4 mr-2" />
                Add Category
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-4 text-sm text-error-600 dark:text-error-400 bg-error-50 dark:bg-error-900/20 border border-error-100 dark:border-error-800 rounded-xl p-3">
              {error}
            </div>
          )}

          {/* Search Bar - Mobile Optimized */}
          {!isLoading && categories.length > 0 && (
            <div className="mb-4 lg:mb-6">
              <div className="relative">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search categories..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm dark:text-white dark:placeholder:text-gray-500 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  style={{ WebkitAppearance: 'none' }}
                  inputMode="search"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                    title="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border dark:border-gray-700 p-4 lg:card lg:!p-6">
            {isLoading && (
              <div className="text-center py-8">
                <div className="w-8 h-8 border-2 border-primary-600 dark:border-primary-400 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Loading categories...</p>
              </div>
            )}

            {!isLoading && categories.length === 0 && (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                  <TagIcon className="h-8 w-8 text-gray-400 dark:text-gray-500" />
                </div>
                <h3 className="text-base font-medium text-gray-900 dark:text-white">No categories</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Create your first category</p>
                <button
                  onClick={() => setShowAdd(true)}
                  className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-xl text-sm font-medium"
                >
                  Add Category
                </button>
              </div>
            )}

            {!isLoading && categories.length > 0 && filteredCategories.length === 0 && (
              <div className="text-center py-8">
                <SearchIcon className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600 mb-3" />
                <h3 className="text-sm font-medium text-gray-900 dark:text-white">No categories found</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Try a different search term</p>
              </div>
            )}

            {/* Expense Categories Section */}
            {!isLoading && expenseCategories.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 bg-red-50 dark:bg-red-900/20 rounded-lg flex items-center justify-center">
                    <span className="text-sm">💸</span>
                  </div>
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Expense Categories
                  </h3>
                  <span className="ml-auto text-xs text-gray-400 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
                    {expenseCategories.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                  {expenseCategories.map((cat) => (
                    <CategoryRow
                      key={cat.id}
                      cat={cat}
                      editingId={editingId}
                      editingName={editingName}
                      editingIcon={editingIcon}
                      editingType={editingType}
                      setEditingName={setEditingName}
                      setEditingIcon={setEditingIcon}
                      setEditingType={setEditingType}
                      handleUpdate={handleUpdate}
                      handleCancelEdit={handleCancelEdit}
                      generateEmojiWithAI={generateEmojiWithAI}
                      generatingEmoji={generatingEmoji}
                      saving={saving}
                      formatDate={formatDate}
                      handleEdit={handleEdit}
                      handleDelete={handleDelete}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Income Categories Section */}
            {!isLoading && incomeCategories.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 bg-green-50 dark:bg-green-900/20 rounded-lg flex items-center justify-center">
                    <span className="text-sm">💰</span>
                  </div>
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Income Categories
                  </h3>
                  <span className="ml-auto text-xs text-gray-400 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
                    {incomeCategories.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                  {incomeCategories.map((cat) => (
                    <CategoryRow
                      key={cat.id}
                      cat={cat}
                      editingId={editingId}
                      editingName={editingName}
                      editingIcon={editingIcon}
                      editingType={editingType}
                      setEditingName={setEditingName}
                      setEditingIcon={setEditingIcon}
                      setEditingType={setEditingType}
                      handleUpdate={handleUpdate}
                      handleCancelEdit={handleCancelEdit}
                      generateEmojiWithAI={generateEmojiWithAI}
                      generatingEmoji={generatingEmoji}
                      saving={saving}
                      formatDate={formatDate}
                      handleEdit={handleEdit}
                      handleDelete={handleDelete}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {showAdd && (
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50 p-4">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
                <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white mb-4">Add Category</h3>
                {error && (
                  <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400">
                    {error}
                  </div>
                )}
                <form onSubmit={handleAdd} className="space-y-4">
                  <div>
                    <label className="label text-sm dark:text-gray-300">Type</label>
                    <select
                      value={newCategory.type}
                      onChange={(e) => setNewCategory(prev => ({ ...prev, type: e.target.value as 'income' | 'expense' }))}
                      className="input dark:bg-gray-700 dark:text-white dark:border-gray-600"
                    >
                      <option value="expense">💸 Expense</option>
                      <option value="income">💰 Income</option>
                    </select>
                  </div>
                  <div>
                    <label className="label text-sm dark:text-gray-300">Category Name</label>
                    <input
                      type="text"
                      required
                      value={newCategory.name}
                      onChange={(e) => setNewCategory(prev => ({ ...prev, name: e.target.value }))}
                      className="input dark:bg-gray-700 dark:text-white dark:border-gray-600"
                      placeholder="e.g., Groceries, Gas, etc."
                    />
                  </div>
                  <div>
                    <label className="label text-sm dark:text-gray-300">Icon (Emoji)</label>
                    <div className="flex gap-2 items-start">
                      <input
                        type="text"
                        value={newCategory.icon}
                        onChange={(e) => setNewCategory(prev => ({ ...prev, icon: e.target.value }))}
                        className="input w-20 text-center text-2xl dark:bg-gray-700 dark:text-white dark:border-gray-600"
                        placeholder="🏷️"
                        maxLength={2}
                      />
                      <button
                        type="button"
                        onClick={() => generateEmojiWithAI(newCategory.name, false)}
                        disabled={generatingEmoji || !newCategory.name.trim()}
                        className="px-3 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg text-sm font-medium hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 whitespace-nowrap"
                        title="Generate emoji with AI"
                      >
                        {generatingEmoji ? (
                          <>
                            <span className="animate-spin">⚡</span>
                            <span>Generating...</span>
                          </>
                        ) : (
                          <>
                            <span>✨</span>
                            <span>AI Suggest</span>
                          </>
                        )}
                      </button>
                    </div>
                    <div className="mt-2">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Choose an emoji or let AI suggest one</p>
                      <div className="flex flex-wrap gap-1">
                        {['🍽️', '🛒', '🚗', '⛽', '🛍️', '🎬', '💡', '⚕️', '✈️', '📚', '💪', '🏡', '🎁', '📱', '☕', '📦'].map(emoji => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => setNewCategory(prev => ({ ...prev, icon: emoji }))}
                            className={`w-8 h-8 rounded-lg text-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors ${newCategory.icon === emoji ? 'bg-primary-100 dark:bg-primary-900/30 ring-2 ring-primary-500 dark:ring-primary-400' : 'bg-gray-50 dark:bg-gray-700'}`}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3 pt-4">
                    <button type="submit" disabled={saving} className="btn-primary flex-1 w-full">
                      {saving ? 'Adding...' : 'Add Category'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowAdd(false); setError(null) }}
                      className="btn-secondary flex-1 w-full"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </Layout>
    </RequireAuth>
  )
}

// CategoryRow component
function CategoryRow({ cat, editingId, editingName, editingIcon, editingType, setEditingName, setEditingIcon, setEditingType, handleUpdate, handleCancelEdit, generateEmojiWithAI, generatingEmoji, saving, formatDate, handleEdit, handleDelete }: any) {
  return (
    <div className="group flex items-center justify-between p-2.5 lg:p-3 bg-gray-50 dark:bg-gray-700/50 hover:bg-white dark:hover:bg-gray-700 rounded-lg border border-transparent hover:border-gray-200 dark:hover:border-gray-600 hover:shadow-sm transition-all">
      {editingId === cat.id ? (
        <div className="flex items-center gap-1.5 flex-1 flex-wrap">
          <select
            value={editingType}
            onChange={(e) => setEditingType(e.target.value)}
            className="w-11 px-1 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md text-xs focus:ring-2 focus:ring-primary-500 flex-shrink-0 dark:text-white"
          >
            <option value="expense">💸</option>
            <option value="income">💰</option>
          </select>
          <input
            type="text"
            value={editingIcon}
            onChange={(e) => setEditingIcon(e.target.value)}
            className="w-9 px-1 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md text-base focus:ring-2 focus:ring-primary-500 text-center flex-shrink-0"
            placeholder="🏷️"
            maxLength={2}
          />
          <input
            type="text"
            value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleUpdate(cat.id)
              else if (e.key === 'Escape') handleCancelEdit()
            }}
            className="flex-1 min-w-[120px] px-2 py-1 bg-white dark:bg-gray-800 dark:text-white border border-gray-200 dark:border-gray-600 rounded-md text-sm focus:ring-2 focus:ring-primary-500"
            placeholder="Category name"
            autoFocus
          />
          <button
            type="button"
            onClick={() => generateEmojiWithAI(editingName, true)}
            disabled={generatingEmoji || !editingName.trim()}
            className="px-2 py-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-md text-xs font-medium hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
            title="Generate emoji with AI"
          >
            {generatingEmoji ? <span className="animate-spin">⚡</span> : '✨'}
          </button>
          <button
            onClick={() => handleUpdate(cat.id)}
            disabled={saving}
            className="p-1.5 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/30 rounded-md disabled:opacity-50 flex-shrink-0"
            title="Save"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          </button>
          <button
            onClick={handleCancelEdit}
            className="p-1.5 text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-md flex-shrink-0"
            title="Cancel"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="w-8 h-8 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-600 group-hover:from-primary-50 group-hover:to-indigo-100 dark:group-hover:from-primary-900/30 dark:group-hover:to-indigo-900/30 rounded-lg flex items-center justify-center flex-shrink-0 text-lg transition-colors">
              {cat.icon || '🏷️'}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-gray-900 dark:text-white text-sm truncate">{cat.name}</h3>
            </div>
          </div>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => handleEdit(cat)}
              className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded-md"
              title="Edit"
            >
              <EditIcon className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleDelete(cat.id)}
              className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md"
              title="Delete"
            >
              <TrashIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </>
      )}
    </div>
  )
}
