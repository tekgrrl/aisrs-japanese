export function applyFurigana(enabled: boolean) {
  if (typeof document === 'undefined') return;
  if (enabled) {
    document.documentElement.setAttribute('data-furigana', 'true');
  } else {
    document.documentElement.removeAttribute('data-furigana');
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('furiganaVisible', String(enabled));
  }
}

export function loadFurigana(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem('furiganaVisible') === 'true';
}
