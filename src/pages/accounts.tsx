import Head from 'next/head'
import { useState } from 'react'
import { useRouter } from 'next/router'
import Layout from '@/components/Layout'
import { PlusIcon, WalletCards, CreditCard, Banknote, Building2, Smartphone, Pencil, Trash2 } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { collection, query, getDocs, orderBy, doc, deleteDoc } from 'firebase/firestore'
import { db } from '@/lib/firebaseClient'
import { useAuth } from '@/contexts/AuthContext'
import { RequireAuth } from '@/components/RequireAuth'
import { useEnvironment } from '@/contexts/EnvironmentContext'
import { usePreferences } from '@/contexts/PreferencesContext'
import AddAccountModal from '@/components/AddAccountModal'
import { Account } from '@/types/models'

// Helper to get icon for account type
function AccountIcon({ type, className }: { type: string, className?: string }) {
    switch (type) {
        case 'Cash': return <Banknote className={className} />
        case 'Credit Card': return <CreditCard className={className} />
        case 'Mobile Money': return <Smartphone className={className} />
        case 'Bank': return <Building2 className={className} />
        default: return <WalletCards className={className} />
    }
}

export default function AccountsPage() {
    const [showAdd, setShowAdd] = useState(false)
    const [editAccount, setEditAccount] = useState<Account | null>(null)
    const queryClient = useQueryClient()
    const router = useRouter()
    const { user } = useAuth()
    const { currentEnvironment, getCollection } = useEnvironment()
    const { formatCurrencyExplicit } = usePreferences()

    const { data: accounts = [], isLoading } = useQuery<Account[]>({
        queryKey: ['accounts', user?.uid, currentEnvironment.id],
        enabled: !!user?.uid,
        queryFn: async () => {
            if (!user) return []
            const accountsRef = getCollection('accounts')
            const q = query(accountsRef, orderBy('name', 'asc'))
            const snapshot = await getDocs(q)
            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Account[]
        }
    })

    // Calculate total balance across all accounts (approximate if mixed currencies, but useful for visual)
    const totalBalance = accounts.reduce((sum, acc) => sum + (acc.balance || 0), 0)

    const handleDeleteAccount = async (account: Account) => {
        if (!user) return

        const confirmDelete = window.confirm(`Are you sure you want to delete the account "${account.name}"? This action cannot be undone. Transactions associated with this account will remain.`)

        if (!confirmDelete) return

        try {
            const accountsRef = getCollection('accounts')
            const accDocRef = doc(accountsRef, account.id)
            await deleteDoc(accDocRef)
            queryClient.invalidateQueries({ queryKey: ['accounts'] })
        } catch (err: any) {
            console.error('Delete error:', err)
            alert('Failed to delete account: ' + err.message)
        }
    }

    return (
        <RequireAuth>
            <Layout>
                <Head>
                    <title>Accounts - Expenso</title>
                </Head>

                <div className="max-w-7xl mx-auto px-4 lg:px-8 py-4 lg:py-8">
                    {/* Mobile Header */}
                    <div className="lg:hidden mb-4">
                        <div className="flex items-center justify-between mb-4">
                            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Accounts</h1>
                            <button
                                onClick={() => setShowAdd(true)}
                                className="w-10 h-10 bg-primary-600 hover:bg-primary-700 rounded-full flex items-center justify-center shadow-lg transition-colors"
                            >
                                <PlusIcon className="w-5 h-5 text-white" />
                            </button>
                        </div>

                        {/* Total Balance Card */}
                        {accounts.length > 0 && (
                            <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl shadow-lg p-4 mb-4">
                                <p className="text-blue-100 text-xs font-medium mb-1">Total Balance</p>
                                <p className="text-2xl font-bold text-white mb-2">
                                    {formatCurrencyExplicit(totalBalance, currentEnvironment.currency || 'USD')}
                                </p>
                                <p className="text-blue-100 text-xs">{accounts.length} account{accounts.length !== 1 ? 's' : ''}</p>
                            </div>
                        )}
                    </div>

                    {/* Desktop Header */}
                    <div className="hidden lg:flex items-center justify-between mb-8">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Accounts</h1>
                            <p className="text-gray-500 dark:text-gray-400 mt-1">Manage your banks, cards, and wallets in {currentEnvironment.name}</p>
                        </div>
                        <button
                            onClick={() => setShowAdd(true)}
                            className="btn-primary inline-flex items-center"
                        >
                            <PlusIcon className="w-4 h-4 mr-2" />
                            Add Account
                        </button>
                    </div>

                    {isLoading ? (
                        <div className="text-center py-12 text-gray-500 dark:text-gray-400">Loading accounts...</div>
                    ) : accounts.length === 0 ? (
                        <div className="text-center py-16 bg-gray-50 dark:bg-gray-800 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                            <WalletCards className="w-12 h-12 mx-auto text-gray-400 dark:text-gray-500 mb-4" />
                            <h3 className="text-lg font-medium text-gray-900 dark:text-white">No accounts yet</h3>
                            <p className="text-gray-500 dark:text-gray-400 max-w-sm mx-auto mt-2 mb-6">
                                Add your bank accounts, credit cards, or cash wallets to start tracking balances.
                            </p>
                            <button
                                onClick={() => setShowAdd(true)}
                                className="btn-primary"
                            >
                                Add Your First Account
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-3 lg:gap-6">
                            {accounts.map(account => (
                                <div
                                    key={account.id}
                                    className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 lg:p-6 hover:shadow-md transition-all cursor-pointer group"
                                    onClick={() => router.push(`/expenses?account=${account.id}&accountName=${encodeURIComponent(account.name)}`)}
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-2 lg:gap-3">
                                            <div className={`p-2 lg:p-3 rounded-lg lg:rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 group-hover:bg-blue-100 dark:group-hover:bg-blue-900/50 transition-colors`}>
                                                <AccountIcon type={account.type} className="w-5 h-5 lg:w-6 lg:h-6" />
                                            </div>
                                            <div>
                                                <h3 className="text-sm lg:text-base font-semibold text-gray-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">{account.name}</h3>
                                                <p className="text-xs lg:text-sm text-gray-500 dark:text-gray-400">{account.type}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    setEditAccount(account)
                                                }}
                                                className="p-1.5 lg:p-2 text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                                                title="Edit account"
                                            >
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    handleDeleteAccount(account)
                                                }}
                                                className="p-1.5 lg:p-2 text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                                                title="Delete account"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="mt-4 lg:mt-6">
                                        <p className="text-xs lg:text-sm text-gray-500 dark:text-gray-400 mb-1">Current Balance</p>
                                        <p className={`text-xl lg:text-2xl font-bold ${account.balance < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
                                            {formatCurrencyExplicit(account.balance, account.currency)}
                                        </p>
                                    </div>

                                    <div className="mt-3 pt-3 border-t border-gray-100">
                                        <p className="text-xs text-gray-500 group-hover:text-primary-600 transition-colors">Click to view transactions →</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <AddAccountModal
                    open={showAdd}
                    onClose={() => setShowAdd(false)}
                    onAdded={() => {
                        queryClient.invalidateQueries({ queryKey: ['accounts'] })
                        setShowAdd(false)
                    }}
                    environmentCountry={currentEnvironment.country}
                />

                <AddAccountModal
                    open={!!editAccount}
                    onClose={() => setEditAccount(null)}
                    mode="edit"
                    account={editAccount}
                    onAdded={() => {
                        queryClient.invalidateQueries({ queryKey: ['accounts'] })
                        setEditAccount(null)
                    }}
                    environmentCountry={currentEnvironment.country}
                />
            </Layout>
        </RequireAuth>
    )
}
