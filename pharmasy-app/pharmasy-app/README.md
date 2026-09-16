# দোকানের হিসাব — ফ্রিতে লাইভ করার গাইড

দুইটা ধাপ: (১) Firebase-এ ফ্রি ডাটাবেস বানানো, (২) Vercel-এ ফ্রি হোস্টিং।
পুরোটাই ব্রাউজার থেকে করা যায়, কোনো টাকা লাগবে না।

## ধাপ ১ — Firebase (ডেটাবেস)

1. https://console.firebase.google.com এ যান, Google অ্যাকাউন্ট দিয়ে লগইন করুন।
2. "Add project" → একটা নাম দিন (যেমন `dokan-hishab`) → Continue → Google Analytics অপশনটা বন্ধ করে দিতে পারেন (দরকার নেই) → Create project।
3. বাম পাশের মেনু থেকে **Build > Firestore Database** → "Create database" → লোকেশন হিসেবে যেকোনো কাছেরটা (যেমন `asia-south1`) বেছে **Start in production mode** এ ক্লিক করুন → Enable।
4. Firestore চালু হয়ে গেলে **Rules** ট্যাবে যান, এই প্রজেক্টের `firestore.rules` ফাইলের কোডটা পেস্ট করে **Publish** চাপুন।
5. এবার প্রজেক্টের গিয়ারআইকন (⚙️) → **Project settings** → নিচে "Your apps" সেকশনে **</> (Web)** আইকনে ক্লিক করুন → একটা নাম দিয়ে "Register app"।
6. এরপর যে `firebaseConfig = {...}` অবজেক্টটা দেখাবে, তার প্রতিটা মান কপি করে নিন — `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`।

## ধাপ ২ — লোকালি টেস্ট করা (ঐচ্ছিক, চাইলে স্কিপ করে সরাসরি ধাপ ৩-এ যান)

```bash
npm install
cp .env.example .env
# .env ফাইল খুলে ধাপ ১-এর মানগুলো বসান
npm run dev
```

## ধাপ ৩ — Vercel-এ ফ্রি ডিপ্লয়

**সবচেয়ে সহজ পথ (GitHub ছাড়াই, Vercel CLI দিয়ে):**

```bash
npm install -g vercel
vercel login
vercel
```
- প্রশ্নগুলোতে সব ডিফল্ট রেখে Enter চাপলেই চলবে।
- প্রথমবার ডিপ্লয়ের পর Vercel ড্যাশবোর্ডে (vercel.com) গিয়ে আপনার প্রজেক্ট খুলুন → **Settings > Environment Variables** → ধাপ ১-এর ৬টা মান (VITE_FIREBASE_...) একে একে বসান (Name = `.env.example`-এর নামগুলো, Value = Firebase থেকে কপি করা মান) → Save।
- তারপর আবার রান করুন:
```bash
vercel --prod
```
- এবার একটা লিংক পাবেন যেমন `https://dokan-hishab.vercel.app` — এটাই malik-কে দিন। যেকোনো ব্রাউজার/ডিভাইস (Chrome, ফোন, ট্যাব, যেকোনো জায়গা থেকে) এই লিংকে ঢুকলেই অ্যাপ চলবে, আর সব ডেটা Firebase-এ (ক্লাউডে) সেভ থাকবে — সবাই একই ডেটা দেখবে।

**বিকল্প পথ (GitHub দিয়ে, যদি পরে নিজে কোড এডিট করতে চান):**
1. এই ফোল্ডারটা একটা নতুন GitHub রিপোতে push করুন।
2. vercel.com এ গিয়ে "Add New Project" → GitHub রিপো সিলেক্ট করুন → Import।
3. Environment Variables-এ Firebase-এর ৬টা মান বসান → Deploy।

## নিয়মিত ব্যবহার

- **স্টক/বিক্রয় সীমা:** Firebase-এর ফ্রি (Spark) প্ল্যানে প্রতিদিন ৫০,০০০ রিড + ২০,০০০ রাইট ফ্রি — একটা দোকানের জন্য এটা অনেক বেশি, সহজে ফুরাবে না।
- **কাস্টম ডোমেইন** (যেমন `apnardokan.com`) চাইলে Vercel প্রজেক্ট Settings > Domains থেকে যোগ করা যায় (ডোমেইন কেনাটা অবশ্য ফ্রি না, কিন্তু Vercel সাবডোমেইন — `xxx.vercel.app` — সবসময় ফ্রি)।
- **নিরাপত্তা নোট:** এই সেটআপে কোনো লগইন-লক নেই — লিংক যার কাছে যাবে সে ডেটা দেখতে/বদলাতে পারবে। শুধু বিশ্বস্ত মানুষকে (মালিক/স্টাফ) লিংক দিন।
