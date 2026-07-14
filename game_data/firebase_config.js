// パルボックス「友達と共有」機能用のFirebase Webアプリ設定。
// Firebase Consoleでプロジェクトを作成し、Firestoreを有効化した後、
// 「プロジェクトの設定」→全般→マイアプリ から取得した値に書き換えてください。
// apiKeyが空のままだと、共有機能は「準備中」として無効化されます
// (Firebase Web設定値はFirestoreのセキュリティルールで保護するものなので、
//  このファイルをそのままコミットしても問題ありません)。
const FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
};
