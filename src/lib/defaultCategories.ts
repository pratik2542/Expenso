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
  { name: 'Transfer', icon: '↔️', emoji: '↔️' },
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
    
    // Get existing category names (case-insensitive for duplicate checking)
    const existingCategoryNames = new Set(
      existingSnapshot.docs.map(doc => doc.data().name?.toLowerCase().trim() || '')
    )
    
    // Filter out categories that already exist
    const categoriesToAdd = DEFAULT_CATEGORIES.filter(category => {
      const normalizedName = category.name.toLowerCase().trim()
      return !existingCategoryNames.has(normalizedName)
    })
    
    if (categoriesToAdd.length > 0) {
      console.log(`Initializing ${categoriesToAdd.length} default categories for user:`, userId)
      
      // Add only new categories
      const promises = categoriesToAdd.map(category =>
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
      console.log('All default categories already exist, skipping initialization')
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
  const name = categoryName.toLowerCase()
  
  // Income categories with relevant emojis
  if (name.includes('salary') || name.includes('wage')) return '💰'
  if (name.includes('business') || name.includes('profit')) return '💼'
  if (name.includes('investment') || name.includes('dividend') || name.includes('interest')) return '📈'
  if (name.includes('rental') || name.includes('rent income')) return '🏠'
  if (name.includes('freelance') || name.includes('consulting')) return '💻'
  if (name.includes('gift') || name.includes('present')) return '🎁'
  if (name.includes('refund') || name.includes('cashback')) return '💵'
  if (name.includes('award') || name.includes('prize') || name.includes('bonus')) return '🏆'
  if (name.includes('lottery') || name.includes('jackpot')) return '🎰'
  if (name.includes('sale') || name.includes('selling')) return '🏪'
  if (name.includes('grant') || name.includes('scholarship')) return '🎓'
  if (name.includes('coupon') || name.includes('voucher')) return '🎟️'
  
  // Check default categories list
  const category = DEFAULT_CATEGORIES.find(
    c => c.name.toLowerCase() === name
  )
  if (category) return category.icon
  
  // Fallback for common expense categories
  if (name.includes('food') || name.includes('dining') || name.includes('restaurant')) return '🍽️'
  if (name.includes('groceries') || name.includes('grocery')) return '🛒'
  if (name.includes('shopping') || name.includes('clothes') || name.includes('fashion')) return '🛍️'
  if (name.includes('transport') || name.includes('car') || name.includes('taxi') || 
      name.includes('uber') || name.includes('fuel') || name.includes('gas')) return '🚗'
  if (name.includes('bill') || name.includes('utilities') || name.includes('electricity') ||
      name.includes('water') || name.includes('internet')) return '📄'
  if (name.includes('entertainment') || name.includes('movie') || name.includes('games')) return '🎬'
  if (name.includes('health') || name.includes('medical') || name.includes('doctor') ||
      name.includes('medicine') || name.includes('hospital')) return '🏥'
  if (name.includes('travel') || name.includes('vacation') || name.includes('hotel') ||
      name.includes('flight')) return '✈️'
  if (name.includes('emi') || name.includes('loan') || name.includes('mortgage')) return '💳'
  if (name.includes('rent') || name.includes('housing')) return '🏠'
  
  return '🏷️'
}
