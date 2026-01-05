import { collection, addDoc, getDocs, query } from 'firebase/firestore'
import { db } from './firebaseClient'

export interface CategoryWithIcon {
  name: string
  icon: string
  emoji: string
}

export const DEFAULT_CATEGORIES: CategoryWithIcon[] = [
  { name: 'Food & Dining', icon: '🍽️', emoji: '🍽️' },
  { name: 'Groceries', icon: '🛒', emoji: '🛒' },
  { name: 'Transportation', icon: '🚗', emoji: '🚗' },
  { name: 'Gas & Fuel', icon: '⛽', emoji: '⛽' },
  { name: 'Shopping', icon: '🛍️', emoji: '🛍️' },
  { name: 'Entertainment', icon: '🎬', emoji: '🎬' },
  { name: 'Bills & Utilities', icon: '💡', emoji: '💡' },
  { name: 'Healthcare', icon: '⚕️', emoji: '⚕️' },
  { name: 'Travel', icon: '✈️', emoji: '✈️' },
  { name: 'Education', icon: '📚', emoji: '📚' },
  { name: 'Fitness', icon: '💪', emoji: '💪' },
  { name: 'Personal Care', icon: '💅', emoji: '💅' },
  { name: 'Home & Garden', icon: '🏡', emoji: '🏡' },
  { name: 'Gifts & Donations', icon: '🎁', emoji: '🎁' },
  { name: 'Insurance', icon: '🛡️', emoji: '🛡️' },
  { name: 'Subscriptions', icon: '📱', emoji: '📱' },
  { name: 'Pet Care', icon: '🐾', emoji: '🐾' },
  { name: 'Coffee & Drinks', icon: '☕', emoji: '☕' },
  { name: 'Other', icon: '📦', emoji: '📦' },
]

/**
 * Initialize default categories for a new user
 * @param userId - The user's ID
 * @returns Promise that resolves when categories are created
 */
export async function initializeDefaultCategories(userId: string): Promise<void> {
  try {
    // Check if user already has categories
    const categoriesRef = collection(db, 'categories', userId, 'items')
    const existingCategoriesQuery = query(categoriesRef)
    const existingSnapshot = await getDocs(existingCategoriesQuery)
    
    // Only initialize if user has no categories
    if (existingSnapshot.empty) {
      console.log('Initializing default categories for user:', userId)
      
      // Add all default categories
      const promises = DEFAULT_CATEGORIES.map(category =>
        addDoc(categoriesRef, {
          name: category.name,
          icon: category.icon,
          created_at: new Date().toISOString(),
          is_default: true,
        })
      )
      
      await Promise.all(promises)
      console.log('Default categories initialized successfully')
    } else {
      console.log('User already has categories, skipping initialization')
    }
  } catch (error) {
    console.error('Error initializing default categories:', error)
    // Don't throw - we don't want to break the signup flow if this fails
  }
}

/**
 * Get icon for a category name
 * @param categoryName - The category name
 * @returns The icon/emoji for the category
 */
export function getCategoryIcon(categoryName: string): string {
  const category = DEFAULT_CATEGORIES.find(
    c => c.name.toLowerCase() === categoryName.toLowerCase()
  )
  return category?.icon || '📦'
}
