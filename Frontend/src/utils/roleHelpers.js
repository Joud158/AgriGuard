export function getDashboardPath(role) {
  if (role === 'admin') return '/admin';
  if (role === 'coach') return '/coach';
  if (role === 'player') return '/player';
  return '/';
}

export function getRoleLabel(role) {
  if (role === 'admin') return 'Administrator';
  if (role === 'coach') return 'Agronomist';
  if (role === 'player') return 'Farmer';
  return 'User';
}

export function getRedirectLabel(role) {
  if (role === 'admin') return 'administrator dashboard';
  if (role === 'coach') return 'agronomist dashboard';
  if (role === 'player') return 'farmer dashboard';
  return 'AgriGuard';
}
