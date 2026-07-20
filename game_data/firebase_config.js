// パルボックス「友達と共有」機能用のFirebase Webアプリ設定。
// Firebase Consoleでプロジェクトを作成し、Firestoreを有効化した後、
// 「プロジェクトの設定」→全般→マイアプリ から取得した値に書き換えてください。
// apiKeyが空のままだと、共有機能は「準備中」として無効化されます
// (Firebase Web設定値はFirestoreのセキュリティルールで保護するものなので、
//  このファイルをそのままコミットしても問題ありません)。
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBjT4kzzNd6UiVZReTsKAc_-91CWCFHHjA",
  authDomain: "palworld-tool.firebaseapp.com",
  projectId: "palworld-tool",
  storageBucket: "palworld-tool.firebasestorage.app",
  messagingSenderId: "471870157239",
  appId: "1:471870157239:web:581a0108f3a20d02f7f832",
};
