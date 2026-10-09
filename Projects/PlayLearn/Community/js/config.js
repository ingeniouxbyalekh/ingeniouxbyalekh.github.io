// Everything you may need to change lives here.
window.CFG = {
  // PlayLearn shop project: source of each student's name, reg. no., semester (/users/<emailKey>)
  shop: {
    apiKey: "AIzaSyABB2Tl_3umwwx1eXKsTiakCPJ3L5TP-yQ",
    authDomain: "playlearn-cb8c1.firebaseapp.com",
    databaseURL: "https://playlearn-cb8c1-default-rtdb.firebaseio.com",
    projectId: "playlearn-cb8c1",
    appId: "1:196791573453:web:429ca975f41f2af7a00284"
  },
  // OUTR community project: where the community /users table is stored and listened to
  community: {
    apiKey: "AIzaSyD5hTz1FRLLdPtdQHBu0NZw971OhqTlkgQ",
    authDomain: "outr-community.firebaseapp.com",
    databaseURL: "https://outr-community-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "outr-community",
    appId: "1:305868195576:web:d2582d040f4ab69b849d0d"
  },
  cloud: { name: "fygvclvm", preset: "PlayLearn" },  // Cloudinary unsigned upload
  sessionKey: "PlayLearn_user_v1",                    // same localStorage key the shop login uses
  loginUrl: "../login.html"
};
