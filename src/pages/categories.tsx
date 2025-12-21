import Head from 'next/head'
import { useState } from 'react'
import Layout from '@/components/Layout'
import { PlusIcon, EditIcon, TrashIcon, TagIcon, SearchIcon } from 'lucide-react'
import { db } from '@/lib/firebaseClient'
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, orderBy } from 'firebase/firestore'
import { useAuth } from '@/contexts/AuthContext'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { RequireAuth } from '@/components/RequireAuth'
import { usePreferences } from '@/contexts/PreferencesContext'

interface Category {
  id: string
  user_id: string
  name: string
  created_at: string
}

export default function CategoriesPage() {
  const { user } = useAuth()
  const { formatDate } = usePreferences()
  const queryClient = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [newCategory, setNewCategory] = useState({ name: '' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  const { data: categories = [], isLoading } = useQuery<Category[]>({
    queryKey: ['categories', user?.uid],
    enabled: !!user?.uid,
    queryFn: async () => {
      if (!user?.uid) return []
      const categoriesRef = collection(db, 'categories', user.uid, 'items')
      const q = query(categoriesRef, orderBy('name', 'asc'))
      const snapshot = await getDocs(q)
      return snapshot.docs.map(doc => ({
        id: doc.id,
        user_id: user.uid,
        name: doc.data().name,
        created_at: doc.data().created_at
      })) as Category[]
    }
  })

  // Filter categories based on search term
  const filteredCategories = categories.filter(cat => 
    cat.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !newCategory.name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const categoriesRef = collection(db, 'categories', user.uid, 'items')
      await addDoc(categoriesRef, {
        name: newCategory.name.trim(),
        created_at: new Date().toISOString()
      })
      queryClient.invalidateQueries({ queryKey: ['categories', user.uid] })
      setNewCategory({ name: '' })
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
      const categoryDocRef = doc(db, 'categories', user.uid, 'items', id)
      await deleteDoc(categoryDocRef)
      queryClient.invalidateQueries({ queryKey: ['categories', user.uid] })
    } catch (error) {
      console.error('Failed to delete category:', error)
    }
  }

  const handleEdit = (category: Category) => {
    setEditingId(category.id)
    setEditingName(category.name)
  }

  const handleUpdate = async (id: string) => {
    if (!user || !editingName.trim()) return
    setSaving(true)
    setError(null)
    try {
      const categoryDocRef = doc(db, 'categories', user.uid, 'items', id)
      await updateDoc(categoryDocRef, {
        name: editingName.trim()
      })
      queryClient.invalidateQueries({ queryKey: ['categories', user.uid] })
      setEditingId(null)
      setEditingName('')
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
  }

  const defaultCategories = [
    'Food & Dining', 'Transportation', 'Shopping', 'Entertainment', 
    'Bills & Utilities', 'Healthcare', 'Travel', 'Other'
  ]

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
                  <h1 className="text-xl font-bold text-gray-900">Categories</h1>
                  <p className="text-sm text-gray-500 mt-0.5">Organize expenses</p>
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
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Categories</h1>
                <p className="text-sm sm:text-base text-gray-600 mt-1 sm:mt-2">Organize your expenses with custom categories</p>
              </div>
              <button onClick={() => setShowAdd(true)} className="btn-primary inline-flex items-center justify-center w-full sm:w-auto">
                <PlusIcon className="w-4 h-4 mr-2" />
                Add Category
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-4 text-sm text-error-600 bg-error-50 border border-error-100 rounded-xl p-3">
              {error}
            </div>
          )}

          {/* Search Bar - Mobile Optimized */}
          {!isLoading && categories.length > 0 && (
            <div className="mb-4 lg:mb-6">
              <div className="relative">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search categories..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    title="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl shadow-sm p-4 lg:card lg:!p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base lg:text-lg font-semibold text-gray-900">Your Categories</h2>
              {searchTerm && (
                <span className="text-xs text-gray-500">
                  {filteredCategories.length}/{categories.length}
                </span>
              )}
            </div>
            
            {isLoading && (
              <div className="text-center py-8">
                <div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                <p className="text-sm text-gray-500">Loading categories...</p>
              </div>
            )}
            
            {!isLoading && categories.length === 0 && (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <TagIcon className="h-8 w-8 text-gray-400" />
                </div>
                <h3 className="text-base font-medium text-gray-900">No categories</h3>
                <p className="text-sm text-gray-500 mt-1">Create your first category</p>
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
                <SearchIcon className="mx-auto h-10 w-10 text-gray-300 mb-3" />
                <h3 className="text-sm font-medium text-gray-900">No categories found</h3>
                <p className="text-xs text-gray-500 mt-1">Try a different search term</p>
              </div>
            )}

            {/* Categories Grid - Mobile Optimized */}
            <div className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
              {filteredCategories.map((cat) => (
                <div 
                  key={cat.id} 
                  className="flex items-center justify-between p-3 bg-white rounded-xl border border-gray-100 shadow-sm lg:border-gray-200 lg:p-4 hover:border-gray-300 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-9 h-9 bg-gradient-to-br from-primary-50 to-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0">
                      <TagIcon className="w-4 h-4 text-primary-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      {editingId === cat.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleUpdate(cat.id)
                              } else if (e.key === 'Escape') {
                                handleCancelEdit()
                              }
                            }}
                            className="flex-1 px-2 py-1 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
                            placeholder="Category name"
                            autoFocus
                          />
                          <button
                            onClick={() => handleUpdate(cat.id)}
                            disabled={saving}
                            className="text-green-600 hover:text-green-800 disabled:opacity-50 p-1"
                            title="Save"
                          >
                            ✓
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="text-gray-400 hover:text-gray-600 p-1"
                            title="Cancel"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div className="min-w-0">
                          <h3 className="font-medium text-gray-900 text-sm truncate">{cat.name}</h3>
                          <p className="text-xs text-gray-400">
                            {formatDate(cat.created_at, { month: 'short', day: 'numeric', year: 'numeric' })}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                  {editingId !== cat.id && (
                    <div className="flex gap-0.5 flex-shrink-0 ml-2">
                      <button 
                        onClick={() => handleEdit(cat)}
                        className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50"
                        title="Edit category"
                      >
                        <EditIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(cat.id)}
                        className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                        title="Delete category"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {!isLoading && categories.length > 0 && (
              <div className="mt-6 pt-4 border-t border-gray-100 lg:border-gray-200">
                <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Default Categories</h3>
                <div className="flex flex-wrap gap-2">
                  {defaultCategories.map((cat) => (
                    <span key={cat} className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-gray-100 text-gray-700">
                      {cat}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {showAdd && (
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
                <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-4">Add Category</h3>
                <form onSubmit={handleAdd} className="space-y-4">
                  <div>
                    <label className="label text-sm">Category Name</label>
                    <input
                      type="text"
                      required
                      value={newCategory.name}
                      onChange={(e) => setNewCategory(prev => ({ ...prev, name: e.target.value }))}
                      className="input"
                      placeholder="e.g., Groceries, Gas, etc."
                    />
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
