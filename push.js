// Notifications sur le téléphone (Web Push), appelées depuis Dart
// (lib/core/push/push_web.dart). Le service worker `push-sw.js` les affiche,
// application fermée comme ouverte.
//
// Portée propre (« notifications/ ») : ce service worker ne remplace jamais
// celui que Flutter pourrait enregistrer à la racine, et inversement.
(function () {
  var SCOPE = 'notifications/';

  function bytes(base64url) {
    var pad = '='.repeat((4 - (base64url.length % 4)) % 4);
    var raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  function supported() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  }

  // L'abonnement exige un service worker ACTIF. `serviceWorker.ready` ne
  // convient pas : il n'aboutit que pour une portée qui contrôle la page,
  // et la nôtre (« notifications/ ») ne la contrôle pas.
  function activated(reg) {
    if (reg.active) return Promise.resolve(reg);
    var worker = reg.installing || reg.waiting;
    return new Promise(function (resolve, reject) {
      if (!worker) return reject(new Error('Service worker introuvable'));
      worker.addEventListener('statechange', function () {
        if (worker.state === 'activated') resolve(reg);
        if (worker.state === 'redundant') reject(new Error('Service worker abandonné'));
      });
    });
  }

  function registration() {
    return navigator.serviceWorker.register('push-sw.js', { scope: SCOPE }).then(activated);
  }

  function describe(sub) {
    if (!sub) return null;
    var j = sub.toJSON();
    return JSON.stringify({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, userAgent: navigator.userAgent });
  }

  window.gescateringPush = {
    supported: supported,
    // 'default' (jamais demandé), 'granted', 'denied' ; 'unsupported' sinon.
    permission: function () { return supported() ? Notification.permission : 'unsupported'; },

    // La permission est demandée EN PREMIER : le navigateur exige qu'elle
    // suive directement le geste de l'utilisateur.
    subscribe: function (publicKey) {
      if (!supported()) return Promise.resolve(null);
      return Notification.requestPermission().then(function (perm) {
        if (perm !== 'granted') return null;
        return registration().then(function (reg) {
          return reg.pushManager.getSubscription().then(function (sub) {
            return sub || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(publicKey) });
          });
        }).then(describe);
      });
    },

    // L'abonnement de cet appareil, s'il existe (sans rien demander).
    current: function () {
      if (!supported() || Notification.permission !== 'granted') return Promise.resolve(null);
      return navigator.serviceWorker.getRegistration(SCOPE).then(function (reg) {
        return reg ? reg.pushManager.getSubscription().then(describe) : null;
      });
    },

    // Se désabonner (déconnexion) : renvoie l'adresse retirée, ou null.
    unsubscribe: function () {
      if (!supported()) return Promise.resolve(null);
      return navigator.serviceWorker.getRegistration(SCOPE).then(function (reg) {
        if (!reg) return null;
        return reg.pushManager.getSubscription().then(function (sub) {
          if (!sub) return null;
          var endpoint = sub.endpoint;
          return sub.unsubscribe().then(function () { return endpoint; });
        });
      });
    }
  };
})();
