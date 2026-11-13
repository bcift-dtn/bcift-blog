export const languages = ['id', 'en'];
export const otherLanguage = language => language === 'en' ? 'id' : 'en';
export const blogPath = (language = 'id') => language === 'en' ? '/blog/en/' : '/blog/';

export function preferredLanguage(saved, browserLanguages) {
  if (languages.includes(saved)) return saved;
  return browserLanguages.map(value => value.toLowerCase().split('-')[0])
    .find(value => languages.includes(value));
}

const labels = {
  'Travel Guide': ['Panduan Wisata', 'Travel Guide'],
  'Travel Tips': ['Tips Perjalanan', 'Tips & Essentials'],
  Destination: ['Destinasi', 'Destination'],
  'Informasi Terminal': ['Informasi Terminal', 'Terminal Information'],
  'Informasi BCIFT': ['Informasi BCIFT', 'BCIFT Information'],
  'Terminal Guide': ['Panduan Terminal', 'Terminal Guide'],
  'Explore Batam': ['Jelajahi Batam', 'Explore Batam'],
};

export function blogCategory(value, language) {
  return labels[value]?.[language === 'en' ? 1 : 0] ?? value;
}

export const transportLabel = (value, language) => language === 'id' ? value : ({
  'Mobil / taksi': 'Car / taxi',
  'Sepeda motor': 'Motorcycle',
  'Jalan kaki': 'On foot',
  'Ferry / kapal': 'Ferry / boat',
})[value] ?? value;
