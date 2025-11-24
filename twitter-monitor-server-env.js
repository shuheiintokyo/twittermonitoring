// twitter-monitor-server-env.js
// Improved version using environment variables
// Install: npm install dotenv node-appwrite

require('dotenv').config();
const { Client, Databases, ID, Query } = require('node-appwrite');
const fs = require('fs');

// Configuration from environment variables
const CONFIG = {
    appwrite: {
        endpoint: process.env.APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1',
        projectId: process.env.APPWRITE_PROJECT_ID,
        apiKey: process.env.APPWRITE_API_KEY,
        databaseId: process.env.APPWRITE_DATABASE_ID,
        collectionId: process.env.APPWRITE_COLLECTION_ID
    },
    twitter: {
        bearerToken: process.env.TWITTER_BEARER_TOKEN,
        userId: process.env.TWITTER_USER_ID,
        username: process.env.TWITTER_USERNAME || 'eitangos'
    },
    checkInterval: parseInt(process.env.CHECK_INTERVAL) || 60000,
    lastTweetIdFile: './last_tweet_id.txt'
};

// Validate configuration
function validateConfig() {
    const required = [
        'APPWRITE_PROJECT_ID',
        'APPWRITE_API_KEY',
        'APPWRITE_DATABASE_ID',
        'APPWRITE_COLLECTION_ID',
        'TWITTER_BEARER_TOKEN',
        'TWITTER_USER_ID'
    ];
    
    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
        console.error('❌ Missing required environment variables:');
        missing.forEach(key => console.error(`   - ${key}`));
        console.error('\nPlease create a .env file based on .env.example');
        process.exit(1);
    }
}

// Initialize Appwrite
const client = new Client()
    .setEndpoint(CONFIG.appwrite.endpoint)
    .setProject(CONFIG.appwrite.projectId)
    .setKey(CONFIG.appwrite.apiKey);

const databases = new Databases(client);

// File operations for last tweet ID
function getLastTweetId() {
    try {
        if (fs.existsSync(CONFIG.lastTweetIdFile)) {
            return fs.readFileSync(CONFIG.lastTweetIdFile, 'utf8').trim();
        }
    } catch (error) {
        console.error('Error reading last tweet ID:', error);
    }
    return null;
}

function saveLastTweetId(tweetId) {
    try {
        fs.writeFileSync(CONFIG.lastTweetIdFile, tweetId);
    } catch (error) {
        console.error('Error saving last tweet ID:', error);
    }
}

// Parse vocabulary from tweet text
function parseVocabulary(text) {
    // Remove URLs, mentions, hashtags
    const cleanText = text
        .replace(/https?:\/\/\S+/g, '')
        .replace(/@\w+/g, '')
        .replace(/#\w+/g, '')
        .trim();
    
    // Check if the text contains both English and Japanese
    const hasEnglish = /[a-zA-Z]/.test(cleanText);
    const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(cleanText);
    
    if (!hasEnglish || !hasJapanese) {
        return null;
    }
    
    // Find the first Japanese character position
    const japaneseMatch = cleanText.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/);
    if (!japaneseMatch) {
        return null;
    }
    
    const japaneseStart = japaneseMatch.index;
    
    // Split at Japanese start
    const english = cleanText.substring(0, japaneseStart).trim();
    const japanese = cleanText.substring(japaneseStart).trim();
    
    if (english && japanese) {
        return { english, japanese };
    }
    
    return null;
}

// Fetch recent tweets from X API
async function fetchRecentTweets(sinceId = null) {
    const url = `https://api.twitter.com/2/users/${CONFIG.twitter.userId}/tweets`;
    const params = new URLSearchParams({
        'max_results': '10',
        'tweet.fields': 'created_at'
    });
    
    if (sinceId) {
        params.append('since_id', sinceId);
    }
    
    try {
        const response = await fetch(`${url}?${params}`, {
            headers: {
                'Authorization': `Bearer ${CONFIG.twitter.bearerToken}`,
                'User-Agent': 'v2RecentTweetsJS'
            }
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Twitter API error: ${response.status} - ${errorText}`);
        }
        
        const data = await response.json();
        return data.data || [];
    } catch (error) {
        console.error('Error fetching tweets:', error.message);
        return [];
    }
}

// Upload vocabulary to Appwrite
async function uploadToAppwrite(english, japanese) {
    try {
        // Check if already exists using Query
        const existing = await databases.listDocuments(
            CONFIG.appwrite.databaseId,
            CONFIG.appwrite.collectionId,
            [
                Query.equal('english', english)
            ]
        );
        
        if (existing.total > 0) {
            console.log(`   ℹ️  Already exists: ${english}`);
            return { status: 'exists' };
        }
        
        // Create new document
        await databases.createDocument(
            CONFIG.appwrite.databaseId,
            CONFIG.appwrite.collectionId,
            ID.unique(),
            {
                english: english,
                japanese: japanese
            }
        );
        
        console.log(`   ✅ Uploaded: ${english} → ${japanese}`);
        return { status: 'uploaded' };
    } catch (error) {
        console.error(`   ❌ Error: ${error.message}`);
        return { status: 'error', error: error.message };
    }
}

// Main monitoring function
async function monitorTweets() {
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    console.log(`\n🔍 [${timestamp}] Checking for new tweets...`);
    
    const lastTweetId = getLastTweetId();
    const tweets = await fetchRecentTweets(lastTweetId);
    
    if (tweets.length === 0) {
        console.log('   No new tweets found.');
        return;
    }
    
    console.log(`   Found ${tweets.length} new tweet(s)\n`);
    
    // Process tweets in reverse order (oldest first)
    const sortedTweets = tweets.reverse();
    let uploadCount = 0;
    let existsCount = 0;
    let skipCount = 0;
    
    for (const tweet of sortedTweets) {
        console.log(`📝 Tweet: "${tweet.text}"`);
        
        const vocabulary = parseVocabulary(tweet.text);
        
        if (vocabulary) {
            const result = await uploadToAppwrite(vocabulary.english, vocabulary.japanese);
            
            if (result.status === 'uploaded') uploadCount++;
            else if (result.status === 'exists') existsCount++;
        } else {
            console.log('   ⏭️  Not vocabulary format, skipping.');
            skipCount++;
        }
        
        // Update last processed tweet ID
        saveLastTweetId(tweet.id);
    }
    
    console.log(`\n📊 Summary: ✅ ${uploadCount} new | ℹ️ ${existsCount} existing | ⏭️ ${skipCount} skipped`);
}

// Test Appwrite connection
async function testConnection() {
    try {
        console.log('🔌 Testing Appwrite connection...');
        const response = await databases.listDocuments(
            CONFIG.appwrite.databaseId,
            CONFIG.appwrite.collectionId,
            [Query.limit(1)]
        );
        console.log('✅ Appwrite connection successful!');
        console.log(`   Current vocabulary count: ${response.total}\n`);
        return true;
    } catch (error) {
        console.error('❌ Appwrite connection failed:', error.message);
        return false;
    }
}

// Start monitoring
async function startMonitoring() {
    console.log('═══════════════════════════════════════');
    console.log('🚀 EITANGOS Twitter Vocabulary Monitor');
    console.log('═══════════════════════════════════════');
    console.log(`📱 Monitoring: @${CONFIG.twitter.username}`);
    console.log(`⏱️  Check interval: ${CONFIG.checkInterval / 1000} seconds`);
    console.log(`📦 Database: ${CONFIG.appwrite.databaseId}`);
    console.log('═══════════════════════════════════════\n');
    
    // Validate configuration
    validateConfig();
    
    // Test connection
    const connected = await testConnection();
    if (!connected) {
        console.error('Failed to connect to Appwrite. Please check your configuration.');
        process.exit(1);
    }
    
    // Initial check
    await monitorTweets();
    
    // Set up periodic checking
    setInterval(async () => {
        await monitorTweets();
    }, CONFIG.checkInterval);
    
    console.log('\n✨ Monitor is running. Press Ctrl+C to stop.\n');
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\n👋 Shutting down monitor...');
    console.log('Goodbye!\n');
    process.exit(0);
});

process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled rejection at:', promise, 'reason:', reason);
});

// Start the server
startMonitoring().catch(error => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
});