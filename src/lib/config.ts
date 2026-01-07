export const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export const getApiUrl = (path: string) => {
  // In development, always use relative paths to hit local Next.js API routes
  if (process.env.NODE_ENV === 'development') {
    const cleanPath = path.replace(/^\//, '');
    return `/${cleanPath}`;
  }
  
  // In production, use the configured API URL
  const baseUrl = API_URL.replace(/\/$/, '');
  const cleanPath = path.replace(/^\//, '');
  return baseUrl ? `${baseUrl}/${cleanPath}` : `/${cleanPath}`;
};
