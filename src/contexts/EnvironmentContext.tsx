import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { db } from '@/lib/firebaseClient'
import {
    collection,
    query,
    where,
    getDocs,
    addDoc,
    doc,
    getDoc,
    setDoc,
    deleteDoc,
    CollectionReference,
    DocumentData,
    orderBy
} from 'firebase/firestore'
import { Environment } from '@/types/models'
import { usePreferences } from '@/contexts/PreferencesContext'

interface EnvironmentContextValue {
    currentEnvironment: Environment
    environments: Environment[]
    loading: boolean
    createEnvironment: (name: string, currency: string, country?: string, timeZone?: string) => Promise<void>
    provisionDefaults: (envId: string, currency: string) => Promise<void>
    deleteEnvironment: (envId: string) => Promise<void>
    switchEnvironment: (envId: string) => Promise<void>
    reloadCurrentEnvironment: () => Promise<void>
    getCollection: (collectionName: string) => CollectionReference<DocumentData>
}

const EnvironmentContext = createContext<EnvironmentContextValue | undefined>(undefined)

const DEFAULT_ENV: Environment = {
    id: 'default',
    name: 'Personal',
    currency: 'USD', // Will be overwritten by prefs
    created_at: new Date().toISOString()
}

const DEFAULT_EXPENSE_CATEGORIES = [
    'Food & Dining', 'Groceries', 'Shopping', 'Transportation',
    'Bills & Utilities', 'Entertainment', 'Healthcare',
    'Travel', 'Investment', 'Rent', 'EMI', 'Other'
]

const DEFAULT_INCOME_CATEGORIES = [
    'Salary', 'Business', 'Investments', 'Rental', 'Freelance',
    'Gifts', 'Refunds', 'Awards', 'Lottery', 'Sale',
    'Grants', 'Coupons', 'Other'
]

const DEFAULT_ACCOUNTS = [
    { name: 'Cash', type: 'Cash', balance: 0 },
    { name: 'Saving Account', type: 'Savings', balance: 0 },
    { name: 'Credit Card', type: 'Credit Card', balance: 0 },
    { name: 'Demat Account', type: 'Investment', balance: 0 }
]

export function EnvironmentProvider({ children }: { children: ReactNode }) {
    const { user } = useAuth()
    const { currency: prefCurrency, defaultEnvName } = usePreferences()

    // Default env logic: use preference currency and name
    const [currentEnvironment, setCurrentEnvironment] = useState<Environment>({
        ...DEFAULT_ENV,
        name: defaultEnvName,
        currency: prefCurrency || 'USD'
    })

    const [environments, setEnvironments] = useState<Environment[]>([])
    const [loading, setLoading] = useState(true)

    // Load environments
    const loadEnvironments = useCallback(async () => {
        if (!user) {
            setEnvironments([])
            setLoading(false)
            return
        }

        try {
            const envRef = collection(db, 'users', user.uid, 'environments')
            const q = query(envRef, orderBy('created_at', 'asc'))
            const snapshot = await getDocs(q)

            const loadedEnvs: Environment[] = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as Environment))

            // Always include the default environment
            // We check if "default" is in the loaded list (in case we migrated it to real doc)
            // For now, we synthesize it.
            const defaultEnv = { ...DEFAULT_ENV, name: defaultEnvName, currency: prefCurrency || 'USD' }

            setEnvironments([defaultEnv, ...loadedEnvs])
        } catch (err) {
            console.error('Failed to load environments:', err)
        } finally {
            setLoading(false)
        }
    }, [user, prefCurrency, defaultEnvName])

    useEffect(() => {
        loadEnvironments()
    }, [loadEnvironments])

    // Keep default environment properties in sync with preferences
    useEffect(() => {
        if (currentEnvironment.id === 'default') {
            setCurrentEnvironment(prev => ({
                ...prev,
                name: defaultEnvName,
                currency: prefCurrency || 'USD'
            }))
        }
    }, [defaultEnvName, prefCurrency, currentEnvironment.id])

    // Persist current environment selection in local storage or user prefs? 
    // For now, simple local state (resets on reload). 
    // Better: Save to localStorage.
    useEffect(() => {
        const saved = localStorage.getItem('expenso_current_env')
        if (saved && environments.some(e => e.id === saved)) {
            const target = environments.find(e => e.id === saved)
            if (target) setCurrentEnvironment(target)
        } else {
            // If currently selected is not in list, revert to default
            const defaultEnv = environments.find(e => e.id === 'default')
            if (defaultEnv) setCurrentEnvironment(defaultEnv)
        }
    }, [environments])

    const getAutoTimeZone = (country?: string) => {
        if (!country) return 'UTC'
        switch (country) {
            case 'Canada': return 'America/Toronto'
            case 'India': return 'Asia/Kolkata'
            case 'USA': return 'America/New_York'
            case 'UK': return 'Europe/London'
            case 'Europe': return 'Europe/Paris'
            default: return 'UTC'
        }
    }

    const provisionDefaults = async (envId: string, currency: string) => {
        if (!user) return

        let categoryRef, accountRef
        if (envId === 'default') {
            categoryRef = collection(db, 'categories', user.uid, 'items')
            accountRef = collection(db, 'accounts', user.uid, 'items')
        } else {
            categoryRef = collection(db, 'users', user.uid, 'environments', envId, 'categories')
            accountRef = collection(db, 'users', user.uid, 'environments', envId, 'accounts')
        }

        // Get existing categories to check for duplicates
        const { getDocs, query } = await import('firebase/firestore')
        const existingCategoriesQuery = query(categoryRef)
        const existingSnapshot = await getDocs(existingCategoriesQuery)
        
        // Get existing category names (case-insensitive for duplicate checking)
        const existingCategoryNames = new Set(
            existingSnapshot.docs.map(doc => {
                const data = doc.data()
                return `${(data.name || '').toLowerCase().trim()}_${data.type || 'expense'}`
            })
        )

        // Filter out categories that already exist (checking both name and type)
        const expenseCatsToAdd = DEFAULT_EXPENSE_CATEGORIES.filter(name => {
            const key = `${name.toLowerCase().trim()}_expense`
            return !existingCategoryNames.has(key)
        })

        const incomeCatsToAdd = DEFAULT_INCOME_CATEGORIES.filter(name => {
            const key = `${name.toLowerCase().trim()}_income`
            return !existingCategoryNames.has(key)
        })

        // Add default expense categories (only new ones)
        const expenseCatPromises = expenseCatsToAdd.map(name => addDoc(categoryRef, {
            name,
            type: 'expense',
            created_at: new Date().toISOString()
        }))

        // Add default income categories (only new ones)
        const incomeCatPromises = incomeCatsToAdd.map(name => addDoc(categoryRef, {
            name,
            type: 'income',
            created_at: new Date().toISOString()
        }))

        const catPromises = [...expenseCatPromises, ...incomeCatPromises]

        // Add default accounts
        const accPromises = DEFAULT_ACCOUNTS.map(acc => addDoc(accountRef, {
            ...acc,
            currency,
            created_at: new Date().toISOString()
        }))

        await Promise.all([...catPromises, ...accPromises])
    }

    const createEnvironment = async (name: string, currency: string, country?: string, timeZone?: string) => {
        if (!user) return

        const finalTimeZone = timeZone || getAutoTimeZone(country)

        // Create new environment doc
        const envRef = collection(db, 'users', user.uid, 'environments')
        const newDoc = await addDoc(envRef, {
            name,
            currency,
            country: country || null,
            time_zone: finalTimeZone,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        })

        // Provision defaults for new environment
        await provisionDefaults(newDoc.id, currency)

        await loadEnvironments()
    }

    const switchEnvironment = async (envId: string) => {
        const target = environments.find(e => e.id === envId)
        if (target) {
            setCurrentEnvironment(target)
            localStorage.setItem('expenso_current_env', envId)
        }
    }

    const deleteEnvironment = async (envId: string) => {
        if (!user || envId === 'default') return

        try {
            const envDocRef = doc(db, 'users', user.uid, 'environments', envId)

            // Delete the environment document
            // NOTE: Sub-collections (expenses, etc) will remain in Firestore but will be inaccessible via UI
            await deleteDoc(envDocRef)

            // If we are deleting the current environment, switch to default
            if (currentEnvironment.id === envId) {
                await switchEnvironment('default')
            }

            await loadEnvironments()
        } catch (err) {
            console.error('Failed to delete environment:', err)
            throw err
        }
    }

    const reloadCurrentEnvironment = async () => {
        if (!user) return

        try {
            if (currentEnvironment.id === 'default') {
                // For default environment, reload from user_settings
                const userSettingsRef = collection(db, 'user_settings')
                const q = query(userSettingsRef, where('user_id', '==', user.uid))
                const querySnapshot = await getDocs(q)
                
                if (!querySnapshot.empty) {
                    const data = querySnapshot.docs[0].data()
                    setCurrentEnvironment(prev => ({
                        ...prev,
                        name: data.default_env_name || defaultEnvName,
                        currency: data.current_currency || prefCurrency || 'USD',
                        time_zone: data.time_zone || 'UTC',
                        country: data.country || ''
                    }))
                }
            } else {
                // For non-default environments, reload from environments collection
                const envDocRef = doc(db, 'users', user.uid, 'environments', currentEnvironment.id)
                const envDoc = await getDoc(envDocRef)
                
                if (envDoc.exists()) {
                    const envData = envDoc.data()
                    setCurrentEnvironment(prev => ({
                        ...prev,
                        name: envData.name || prev.name,
                        currency: envData.currency || prev.currency,
                        time_zone: envData.time_zone || prev.time_zone,
                        country: envData.country || prev.country
                    }))
                }
            }
            
            // Also reload the environments list
            await loadEnvironments()
        } catch (err) {
            console.error('Failed to reload current environment:', err)
        }
    }

    // KEY helper: Get the correct collection reference based on current environment
    const getCollection = (collectionName: string): CollectionReference<DocumentData> => {
        if (!user) throw new Error('User not authenticated')

        if (currentEnvironment.id === 'default') {
            // Legacy paths
            // expenses -> expenses/{uid}/items
            // categories -> categories/{uid}/items
            // accounts -> accounts/{uid}/items (New, mapped to legacy style)
            // budgets -> budgets/{uid}/items
            return collection(db, collectionName, user.uid, 'items')
        } else {
            // New paths: users/{uid}/environments/{envId}/{collectionName}
            return collection(db, 'users', user.uid, 'environments', currentEnvironment.id, collectionName)
        }
    }

    const value = {
        currentEnvironment,
        environments,
        loading,
        createEnvironment,
        provisionDefaults,
        deleteEnvironment,
        switchEnvironment,
        reloadCurrentEnvironment,
        getCollection
    }

    return (
        <EnvironmentContext.Provider value={value}>
            {children}
        </EnvironmentContext.Provider>
    )
}

export function useEnvironment() {
    const ctx = useContext(EnvironmentContext)
    if (!ctx) throw new Error('useEnvironment must be used within EnvironmentProvider')
    return ctx
}
