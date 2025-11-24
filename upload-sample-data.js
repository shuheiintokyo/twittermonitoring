// upload-sample-data.js
require('dotenv').config();
const { Client, Databases, ID } = require('node-appwrite');

const CONFIG = {
    endpoint: process.env.APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1',
    projectId: process.env.APPWRITE_PROJECT_ID,
    apiKey: process.env.APPWRITE_API_KEY,
    databaseId: process.env.APPWRITE_DATABASE_ID,
    collectionId: process.env.APPWRITE_COLLECTION_ID
};

const sampleData = [
    { english: 'make a shift', japanese: 'シフトの作成' },
    { english: 'computer', japanese: 'コンピューター' },
    { english: 'cat', japanese: '猫' },
    { english: 'school trip', japanese: '課外活動' },
    { english: 'dog', japanese: '犬' },
    { english: 'bird', japanese: '鳥' },
    { english: 'fish', japanese: '魚' },
    { english: 'apple', japanese: 'リンゴ' },
    { english: 'orange', japanese: 'オレンジ' },
    { english: 'book', japanese: '本' },
    { english: 'pen', japanese: 'ペン' },
    { english: 'desk', japanese: '机' },
    { english: 'chair', japanese: '椅子' },
    { english: 'water', japanese: '水' },
    { english: 'coffee', japanese: 'コーヒー' },
    { english: 'tea', japanese: 'お茶' },
    { english: 'morning', japanese: '朝' },
    { english: 'afternoon', japanese: '午後' },
    { english: 'evening', japanese: '夕方' },
    { english: 'night', japanese: '夜' },
    { english: 'today', japanese: '今日' },
    { english: 'tomorrow', japanese: '明日' },
    { english: 'yesterday', japanese: '昨日' },
    { english: 'week', japanese: '週' },
    { english: 'month', japanese: '月' },
    { english: 'year', japanese: '年' },
    { english: 'time', japanese: '時間' },
    { english: 'work', japanese: '仕事' },
    { english: 'study', japanese: '勉強' },
    { english: 'friend', japanese: '友達' },
    { english: 'family', japanese: '家族' },
    { english: 'house', japanese: '家' },
    { english: 'car', japanese: '車' },
    { english: 'train', japanese: '電車' },
    { english: 'station', japanese: '駅' },
    { english: 'school', japanese: '学校' },
    { english: 'office', japanese: 'オフィス' },
    { english: 'restaurant', japanese: 'レストラン' },
    { english: 'shop', japanese: '店' },
    { english: 'park', japanese: '公園' },
    { english: 'hospital', japanese: '病院' },
    { english: 'bank', japanese: '銀行' },
    { english: 'phone', japanese: '電話' },
    { english: 'email', japanese: 'メール' },
    { english: 'meeting', japanese: '会議' },
    { english: 'project', japanese: 'プロジェクト' },
    { english: 'task', japanese: 'タスク' },
    { english: 'deadline', japanese: '締め切り' },
    { english: 'budget', japanese: '予算' },
    { english: 'plan', japanese: '計画' }
];

const client = new Client()
    .setEndpoint(CONFIG.endpoint)
    .setProject(CONFIG.projectId)
    .setKey(CONFIG.apiKey);

const databases = new Databases(client);

async function uploadData() {
    console.log('🚀 Starting data upload to Appwrite...\n');
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const item of sampleData) {
        try {
            await databases.createDocument(
                CONFIG.databaseId,
                CONFIG.collectionId,
                ID.unique(),
                {
                    english: item.english,
                    japanese: item.japanese
                }
            );
            
            console.log(`✅ Uploaded: ${item.english} → ${item.japanese}`);
            successCount++;
            
            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
            
        } catch (error) {
            if (error.code === 409) {
                console.log(`⏭️  Skipped (already exists): ${item.english}`);
            } else {
                console.error(`❌ Error uploading ${item.english}:`, error.message);
                errorCount++;
            }
        }
    }
    
    console.log('\n📊 Upload Summary:');
    console.log(`   ✅ Success: ${successCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log(`   📝 Total: ${sampleData.length}`);
}

uploadData()
    .then(() => {
        console.log('\n✨ Upload completed!');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n💥 Fatal error:', error);
        process.exit(1);
    });