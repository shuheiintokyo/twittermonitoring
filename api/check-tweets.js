// api/check-tweets.js
// Serverless function to check Twitter and upload to Appwrite

const { Client, Databases, ID, Query } = require('node-appwrite');

// Configuration from environment variables
const CONFIG = {
    endpoint: process.env.APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1',
    projectId: process.env.APPWRITE_PROJECT_ID,
    apiKey: process.env.APPWRITE_API_KEY,
    databaseId: process.env.APPWRITE_DATABASE_ID,
    collectionId: process.env.APPWRITE_COLLECTION_ID,
    twitterBearerToken: process.env.TWITTER_BEARER_TOKEN,
    twitterUserId: process.env.TWITTER_USER_ID,
    twitterUsername: process.env.TWITTER_USERNAME || 'eitangos'
};

// Store last tweet ID in Vercel KV or use query parameter
let lastTweetId = null;

/**
 * Parse vocabulary from tweet text
 * Supports multi-word English phrases followed by Japanese translation
 */
function parseVocabulary(text) {
    // Remove URLs, mentions, hashtags
    const cleanText = text
        .replace(/https?:\/\/\S+/g, '')
        .replace(/@\w+/g, '')
        .replace(/#\w+/g, '')
        .trim();
    
    // Find where Japanese starts (first Japanese character)
    // Japanese character ranges:
    // \u3040-\u309F: Hiragana (あいうえお)
    // \u30A0-\u30FF: Katakana (アイウエオ)
    // \u4E00-\u9FAF: Kanji (漢字)
    const japaneseStartMatch = cleanText.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/);
    
    if (!japaneseStartMatch) {
        console.log(`⚠️  No Japanese characters found in: "${cleanText}"`);
        return null; // No Japanese found
    }
    
    const japaneseStartIndex = japaneseStartMatch.index;
    
    // Split at the Japanese start point
    const englishPart = cleanText.substring(0, japaneseStartIndex).trim();
    const japanesePart = cleanText.substring(japaneseStartIndex).trim();
    
    // Validate we have both parts
    const hasEnglish = /[a-zA-Z]/.test(englishPart);
    const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(japanesePart);
    
    if (hasEnglish && hasJapanese && englishPart && japanesePart) {
        console.log(`✅ Parsed: "${englishPart}" → "${japanesePart}"`);
        return {
            english: englishPart,
            japanese: japanesePart
        };
    }
    
    console.log(`⚠️  Invalid format: english="${englishPart}", japanese="${japanesePart}"`);
    return null;
}

/**
 * Main handler function
 */
module.exports = async (req, res) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    console.log('🔍 Starting Twitter check...');
    
    try {
        // Validate configuration
        if (!CONFIG.twitterBearerToken || !CONFIG.twitterUserId) {
            throw new Error('Missing Twitter credentials');
        }
        if (!CONFIG.projectId || !CONFIG.apiKey || !CONFIG.databaseId || !CONFIG.collectionId) {
            throw new Error('Missing Appwrite credentials');
        }
        
        // Fetch latest tweets
        const twitterUrl = `https://api.twitter.com/2/users/${CONFIG.twitterUserId}/tweets?max_results=15&tweet.fields=created_at`;
        
        console.log('📡 Fetching tweets from Twitter...');
        const twitterResponse = await fetch(twitterUrl, {
            headers: {
                'Authorization': `Bearer ${CONFIG.twitterBearerToken}`,
                'User-Agent': 'EITANGOS-Monitor/1.0'
            }
        });
        
        if (!twitterResponse.ok) {
            const errorText = await twitterResponse.text();
            console.error('❌ Twitter API error:', twitterResponse.status, errorText);
            
            if (twitterResponse.status === 429) {
                return res.status(429).json({ 
                    error: 'Rate limited',
                    message: 'Too many requests. Please try again in 15 minutes.',
                    nextCheck: new Date(Date.now() + 15 * 60 * 1000).toISOString()
                });
            }
            
            throw new Error(`Twitter API error: ${twitterResponse.status}`);
        }
        
        const tweetsData = await twitterResponse.json();
        console.log(`📊 Received ${tweetsData.data?.length || 0} tweets`);
        
        if (!tweetsData.data || tweetsData.data.length === 0) {
            return res.status(200).json({ 
                message: 'No tweets found',
                checked: true,
                uploaded: 0
            });
        }
        
        // Initialize Appwrite
        const client = new Client()
            .setEndpoint(CONFIG.endpoint)
            .setProject(CONFIG.projectId)
            .setKey(CONFIG.apiKey);
        
        const databases = new Databases(client);
        
        console.log('🔌 Connected to Appwrite');
        
        let uploadedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;
        const results = [];
        
        // Process each tweet
        for (const tweet of tweetsData.data) {
            console.log(`\n📝 Processing tweet: "${tweet.text}"`);
            
            const parsed = parseVocabulary(tweet.text);
            
            if (!parsed) {
                console.log(`⏭️  Skipped (no vocabulary): "${tweet.text}"`);
                skippedCount++;
                continue;
            }
            
            console.log(`📝 Found: ${parsed.english} → ${parsed.japanese}`);
            
            try {
                // Check for duplicates
                const existing = await databases.listDocuments(
                    CONFIG.databaseId,
                    CONFIG.collectionId,
                    [Query.equal('english', parsed.english)]
                );
                
                if (existing.total > 0) {
                    console.log(`ℹ️  Already exists: ${parsed.english}`);
                    skippedCount++;
                    results.push({
                        english: parsed.english,
                        japanese: parsed.japanese,
                        status: 'existing'
                    });
                    continue;
                }
                
                // Upload to Appwrite
                await databases.createDocument(
                    CONFIG.databaseId,
                    CONFIG.collectionId,
                    ID.unique(),
                    {
                        english: parsed.english,
                        japanese: parsed.japanese
                    }
                );
                
                console.log(`✅ Uploaded: ${parsed.english} → ${parsed.japanese}`);
                uploadedCount++;
                results.push({
                    english: parsed.english,
                    japanese: parsed.japanese,
                    status: 'uploaded'
                });
                
            } catch (error) {
                console.error(`❌ Error uploading ${parsed.english}:`, error.message);
                errorCount++;
                results.push({
                    english: parsed.english,
                    japanese: parsed.japanese,
                    status: 'error',
                    error: error.message
                });
            }
        }
        
        // Return summary
        const summary = {
            success: true,
            timestamp: new Date().toISOString(),
            username: CONFIG.twitterUsername,
            tweetsChecked: tweetsData.data.length,
            uploaded: uploadedCount,
            skipped: skippedCount,
            errors: errorCount,
            results: results
        };
        
        console.log('📊 Summary:', JSON.stringify(summary, null, 2));
        
        return res.status(200).json(summary);
        
    } catch (error) {
        console.error('💥 Fatal error:', error);
        
        return res.status(500).json({ 
            error: error.message,
            timestamp: new Date().toISOString(),
            success: false
        });
    }
};
