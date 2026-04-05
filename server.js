const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { MongoClient } = require('mongodb');

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/moviearchive';

const client = new MongoClient(MONGODB_URI);
let db;

// Connect to MongoDB
async function connectDB() {
    try {
        await client.connect();
        db = client.db();
        console.log('Connected to MongoDB');
        
        // Seed data if collection is empty
        const count = await db.collection('movies').countDocuments();
        if (count === 0) {
            // Try to load from movies.json if it exists
            try {
                const data = fs.readFileSync(path.join(__dirname, 'movies.json'), 'utf8');
                const movies = JSON.parse(data);
                await db.collection('movies').insertMany(movies);
                console.log('Seeded database with movies.json data');
            } catch (e) {
                console.log('No movies.json to seed, starting empty');
            }
        }
    } catch (err) {
        console.error('MongoDB connection error:', err);
        process.exit(1);
    }
}

const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml'
};

const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    let pathname = parsedUrl.pathname;
    
    // Handle API endpoints
    if (pathname === '/api/movies') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        
        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }
        
        if (req.method === 'GET') {
            try {
                const movies = await db.collection('movies').find({}).toArray();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(movies));
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to fetch movies' }));
            }
            return;
        }
        
        if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const movies = JSON.parse(body);
                    
                    // Clear and insert new data
                    await db.collection('movies').deleteMany({});
                    if (movies.length > 0) {
                        await db.collection('movies').insertMany(movies);
                    }
                    
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true }));
                } catch (e) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid JSON' }));
                }
            });
            return;
        }
    }
    
    // Serve static files
    if (pathname === '/') {
        pathname = '/index.html';
    }
    
    // Handle year folder routes
    const yearMatch = pathname.match(/^\/(\d{4})\/?$/);
    if (yearMatch) {
        pathname = `/${yearMatch[1]}/${yearMatch[1]}.html`;
    }
    
    const filePath = path.join(__dirname, pathname);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    
    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>404 Not Found</h1>');
            } else {
                res.writeHead(500);
                res.end(`Server Error: ${err.code}`);
            }
        } else {
            res.writeHead(200, { 
                'Content-Type': contentType,
                'Access-Control-Allow-Origin': '*'
            });
            res.end(content, 'utf-8');
        }
    });
});

// Start server after DB connection
connectDB().then(() => {
    server.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}/`);
        console.log(`Manage page: http://localhost:${PORT}/manage.html`);
    });
});

// Graceful shutdown
process.on('SIGINT', async () => {
    await client.close();
    console.log('\nMongoDB connection closed');
    process.exit(0);
});
