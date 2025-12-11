export const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export const getApiUrl = (path: string) => {
  const baseUrl = API_URL.replace(/\/$/, '');
  const cleanPath = path.replace(/^\//, '');
  return baseUrl ? `${baseUrl}/${cleanPath}` : `/${cleanPath}`;
};
