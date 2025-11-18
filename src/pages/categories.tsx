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
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
          <div className="mb-6 sm:mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
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
            <div className="mb-6 text-sm text-error-600 bg-error-50 border border-error-100 rounded p-3">
              {error}
            </div>
          )}

          {/* Search Bar */}
          {!isLoading && categories.length > 0 && (
            <div className="card mb-6">
              <div className="relative">
                <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search categories..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="input !pl-14 pr-3"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    title="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="card">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 sm:mb-6 gap-2">
              <h2 className="text-base sm:text-lg font-semibold text-gray-900">Your Categories</h2>
              {searchTerm && (
                <span className="text-xs sm:text-sm text-gray-500">
                  {filteredCategories.length} of {categories.length} categories
                </span>
              )}
            </div>
            
            {isLoading && <div className="text-sm text-gray-500">Loading categories...</div>}
            
            {!isLoading && categories.length === 0 && (
              <div className="text-center py-8">
                <TagIcon className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No categories</h3>
                <p className="mt-1 text-sm text-gray-500">Get started by creating your first category.</p>
              </div>
            )}

            {!isLoading && categories.length > 0 && filteredCategories.length === 0 && (
              <div className="text-center py-8">
                <SearchIcon className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No categories found</h3>
                <p className="mt-1 text-sm text-gray-500">Try a different search term.</p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
              {filteredCategories.map((cat) => (
                <div key={cat.id} className="border border-gray-200 rounded-lg p-3 sm:p-4 hover:border-gray-300 transition-colors">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                      <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <TagIcon className="w-4 h-4 text-gray-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        {editingId === cat.id ? (
                          <div className="flex items-center gap-1 sm:gap-2">
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
                              className="input text-sm py-1 px-2 min-w-0 flex-1"
                              placeholder="Category name"
                              autoFocus
                            />
                            <button
                              onClick={() => handleUpdate(cat.id)}
                              disabled={saving}
                              className="text-green-600 hover:text-green-800 disabled:opacity-50 flex-shrink-0 text-lg sm:text-base"
                              title="Save"
                            >
                              ✓
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="text-gray-400 hover:text-gray-600 flex-shrink-0 text-lg sm:text-base"
                              title="Cancel"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <div className="min-w-0">
                            <h3 className="font-medium text-gray-900 text-sm sm:text-base truncate">{cat.name}</h3>
                            <p className="text-xs text-gray-500">
                              Created {formatDate(cat.created_at)}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                    {editingId !== cat.id && (
                      <div className="flex gap-1 flex-shrink-0">
                        <button 
                          onClick={() => handleEdit(cat)}
                          className="p-1.5 sm:p-1 text-gray-400 hover:text-gray-600"
                          title="Edit category"
                        >
                          <EditIcon className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(cat.id)}
                          className="p-1.5 sm:p-1 text-gray-400 hover:text-red-600"
                          title="Delete category"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {!isLoading && categories.length > 0 && (
              <div className="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-gray-200">
                <h3 className="text-xs sm:text-sm font-medium text-gray-700 mb-2 sm:mb-3">Default Categories Available</h3>
                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                  {defaultCategories.map((cat) => (
                    <span key={cat} className="inline-flex items-center px-2 sm:px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
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
