/**
 * Compress an image file to reduce its size before upload
 * @param file - The original image file
 * @param maxWidth - Maximum width in pixels (default: 1920)
 * @param maxHeight - Maximum height in pixels (default: 1920)
 * @param quality - JPEG quality 0-1 (default: 0.8)
 * @returns Promise<string> - Base64 encoded compressed image
 */
export async function compressImage(
  file: File,
  maxWidth: number = 1920,
  maxHeight: number = 1920,
  quality: number = 0.8
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    
    reader.onerror = () => {
      reject(new Error('Failed to read file'))
    }
    
    reader.onload = (e) => {
      const img = new Image()
      
      img.onerror = () => {
        reject(new Error('Failed to load image'))
      }
      
      img.onload = () => {
        try {
          // Calculate new dimensions while maintaining aspect ratio
          let width = img.width
          let height = img.height
          
          if (width > maxWidth || height > maxHeight) {
            const aspectRatio = width / height
            
            if (width > height) {
              width = maxWidth
              height = Math.round(width / aspectRatio)
            } else {
              height = maxHeight
              width = Math.round(height * aspectRatio)
            }
          }
          
          // Create canvas and draw resized image
          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height
          
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            reject(new Error('Failed to get canvas context'))
            return
          }
          
          // Use better image smoothing
          ctx.imageSmoothingEnabled = true
          ctx.imageSmoothingQuality = 'high'
          
          // Draw the image on canvas
          ctx.drawImage(img, 0, 0, width, height)
          
          // Convert to base64 with compression
          // Use JPEG for better compression, unless it's a PNG with transparency
          const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
          const compressedBase64 = canvas.toDataURL(mimeType, quality)
          
          resolve(compressedBase64)
        } catch (error) {
          reject(error)
        }
      }
      
      img.src = e.target?.result as string
    }
    
    reader.readAsDataURL(file)
  })
}

/**
 * Get the size of a base64 string in bytes
 */
export function getBase64Size(base64String: string): number {
  // Remove data URL prefix if present
  const base64 = base64String.replace(/^data:image\/\w+;base64,/, '')
  // Calculate size: each base64 character represents 6 bits
  // Padding characters (=) don't count
  const padding = (base64.match(/=/g) || []).length
  return (base64.length * 0.75) - padding
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
}
