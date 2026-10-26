export const TRAVEL_MODES = ['Mobil / taksi', 'Sepeda motor', 'Jalan kaki', 'Ferry / kapal'];
export const isDestination = categories => (Array.isArray(categories)?categories:[categories]).some(category=>category === 'Destination' || category === 'Explore Batam');
export function validateDestinationTrips(value) {
 if (!Array.isArray(value) || value.length > 20) throw new Error('Maksimal 20 lokasi tujuan per artikel.');
 return value.map(trip => {
  if (!trip || typeof trip !== 'object') throw new Error('Informasi lokasi tujuan tidak valid.');
  const location = typeof trip.location === 'string' ? trip.location.trim() : '';
  const minutes = typeof trip.minutes === 'number' || typeof trip.minutes === 'string' ? Number(trip.minutes) : NaN;
  if (!location || location.length > 120) throw new Error('Isi nama lokasi tujuan (maksimal 120 karakter).');
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) throw new Error('Estimasi perjalanan harus 1–1440 menit.');
  if (!TRAVEL_MODES.includes(trip.transport)) throw new Error('Pilih moda perjalanan ke lokasi tujuan.');
  return {location, minutes, transport:trip.transport};
 });
}
export function readDestinationTrips(value) {
 try { return validateDestinationTrips(typeof value === 'string' ? JSON.parse(value) : value ?? []); }
 catch { return []; }
}
