// Service worker מינימלי: נדרש להתקנה כאפליקציה, ובכוונה לא שומר שום דבר במטמון.
// כל בקשה הולכת תמיד לרשת, כך שלעולם לא תוצג גרסה או נתונים ישנים.
// עדכון: ברגע שגרסה חדשה של הקובץ הזה מותקנת היא מופעלת מיד (skipWaiting + claim), והמטמונים (אם נוצרו בעבר) נמחקים.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (event) => {
  // ניווטים (פתיחת האפליקציה) תמיד מהרשת, (ה-HTML מוגש עם no-cache). שאר הבקשות נשארות בטיפול ברירת המחדל של הדפדפן.
  if (event.request.mode === 'navigate') event.respondWith(fetch(event.request));
});
