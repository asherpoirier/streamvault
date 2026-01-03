from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import re
import httpx
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import jwt
from passlib.context import CryptContext
import asyncio

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'streamvault-secret-key-change-in-production')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Security
security = HTTPBearer()

# Create the main app
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# ============ Models ============

class UserCreate(BaseModel):
    username: str
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class UserResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    username: str
    is_admin: bool
    created_at: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

class Channel(BaseModel):
    name: str
    url: str
    logo: Optional[str] = None
    group: Optional[str] = None

class PlaylistCreate(BaseModel):
    provider_name: str
    m3u8_url: str

class PlaylistResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    provider_name: str
    m3u8_url: str
    channels: List[Channel]
    channel_count: int
    created_at: str
    updated_at: str

class ChannelWithProvider(BaseModel):
    name: str
    url: str
    logo: Optional[str] = None
    group: Optional[str] = None
    provider_name: str
    playlist_id: str

# ============ Utilities ============

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(user_id: str, username: str, is_admin: bool) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    payload = {
        "sub": user_id,
        "username": username,
        "is_admin": is_admin,
        "exp": expire
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_admin_user(current_user: dict = Depends(get_current_user)):
    if not current_user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user

def parse_m3u8(content: str) -> List[Channel]:
    """Parse M3U8 content and extract channels"""
    channels = []
    lines = content.strip().split('\n')
    
    current_channel = {}
    
    for line in lines:
        line = line.strip()
        
        if line.startswith('#EXTINF:'):
            # Parse channel info
            # Format: #EXTINF:-1 tvg-id="..." tvg-name="..." tvg-logo="..." group-title="...",Channel Name
            current_channel = {}
            
            # Extract logo
            logo_match = re.search(r'tvg-logo="([^"]*)"', line)
            if logo_match:
                current_channel['logo'] = logo_match.group(1)
            
            # Extract group
            group_match = re.search(r'group-title="([^"]*)"', line)
            if group_match:
                current_channel['group'] = group_match.group(1)
            
            # Extract name (after the comma)
            name_match = re.search(r',(.+)$', line)
            if name_match:
                current_channel['name'] = name_match.group(1).strip()
                
        elif line and not line.startswith('#') and current_channel.get('name'):
            # This is the URL line
            current_channel['url'] = line
            channels.append(Channel(**current_channel))
            current_channel = {}
    
    return channels

async def fetch_and_parse_m3u8(url: str) -> List[Channel]:
    """Fetch M3U8 from URL and parse it"""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url)
            response.raise_for_status()
            return parse_m3u8(response.text)
    except httpx.RequestError as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch M3U8: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse M3U8: {str(e)}")

# ============ Auth Routes ============

@api_router.post("/auth/register", response_model=TokenResponse)
async def register(user_data: UserCreate, admin: dict = Depends(get_admin_user)):
    """Register a new user (admin only)"""
    # Check if user exists
    existing_user = await db.users.find_one({"username": user_data.username})
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    # New users created by admin are never admin themselves
    is_admin = False
    
    # Create user
    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    user_doc = {
        "id": user_id,
        "username": user_data.username,
        "password_hash": hash_password(user_data.password),
        "is_admin": is_admin,
        "created_at": now
    }
    
    await db.users.insert_one(user_doc)
    
    # Return the created user info (no token since admin is creating)
    return TokenResponse(
        access_token="",  # No token for admin-created users
        user=UserResponse(
            id=user_id,
            username=user_data.username,
            is_admin=is_admin,
            created_at=now
        )
    )

@api_router.post("/auth/setup", response_model=TokenResponse)
async def setup_admin(user_data: UserCreate):
    """Setup first admin user (only works if no users exist)"""
    user_count = await db.users.count_documents({})
    if user_count > 0:
        raise HTTPException(status_code=403, detail="Setup already completed. Contact admin for access.")
    
    # Create first admin user
    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    user_doc = {
        "id": user_id,
        "username": user_data.username,
        "password_hash": hash_password(user_data.password),
        "is_admin": True,
        "created_at": now
    }
    
    await db.users.insert_one(user_doc)
    
    token = create_access_token(user_id, user_data.username, True)
    
    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user_id,
            username=user_data.username,
            is_admin=True,
            created_at=now
        )
    )

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(user_data: UserLogin):
    user = await db.users.find_one({"username": user_data.username}, {"_id": 0})
    
    if not user or not verify_password(user_data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = create_access_token(user["id"], user["username"], user["is_admin"])
    
    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user["id"],
            username=user["username"],
            is_admin=user["is_admin"],
            created_at=user["created_at"]
        )
    )

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    user = await db.users.find_one({"id": current_user["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserResponse(**user)

@api_router.get("/users", response_model=List[UserResponse])
async def list_users(admin: dict = Depends(get_admin_user)):
    """List all users (admin only)"""
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(100)
    return [UserResponse(**u) for u in users]

@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, admin: dict = Depends(get_admin_user)):
    """Delete a user (admin only, cannot delete self)"""
    if user_id == admin["sub"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    
    result = await db.users.delete_one({"id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User deleted"}

# ============ Playlist Routes (Admin) ============

@api_router.post("/playlists", response_model=PlaylistResponse)
async def create_playlist(playlist_data: PlaylistCreate, admin: dict = Depends(get_admin_user)):
    # Check if provider already exists
    existing = await db.playlists.find_one({"provider_name": playlist_data.provider_name})
    if existing:
        raise HTTPException(status_code=400, detail="Provider with this name already exists")
    
    # Fetch and parse M3U8
    channels = await fetch_and_parse_m3u8(playlist_data.m3u8_url)
    
    playlist_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    playlist_doc = {
        "id": playlist_id,
        "provider_name": playlist_data.provider_name,
        "m3u8_url": playlist_data.m3u8_url,
        "channels": [ch.model_dump() for ch in channels],
        "channel_count": len(channels),
        "created_at": now,
        "updated_at": now
    }
    
    await db.playlists.insert_one(playlist_doc)
    
    return PlaylistResponse(**playlist_doc)

@api_router.get("/playlists", response_model=List[PlaylistResponse])
async def get_playlists(admin: dict = Depends(get_admin_user)):
    playlists = await db.playlists.find({}, {"_id": 0}).to_list(100)
    return [PlaylistResponse(**p) for p in playlists]

@api_router.get("/playlists/{playlist_id}", response_model=PlaylistResponse)
async def get_playlist(playlist_id: str, admin: dict = Depends(get_admin_user)):
    playlist = await db.playlists.find_one({"id": playlist_id}, {"_id": 0})
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    return PlaylistResponse(**playlist)

@api_router.put("/playlists/{playlist_id}/refresh", response_model=PlaylistResponse)
async def refresh_playlist(playlist_id: str, admin: dict = Depends(get_admin_user)):
    playlist = await db.playlists.find_one({"id": playlist_id}, {"_id": 0})
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    
    # Re-fetch and parse M3U8
    channels = await fetch_and_parse_m3u8(playlist["m3u8_url"])
    now = datetime.now(timezone.utc).isoformat()
    
    await db.playlists.update_one(
        {"id": playlist_id},
        {"$set": {
            "channels": [ch.model_dump() for ch in channels],
            "channel_count": len(channels),
            "updated_at": now
        }}
    )
    
    updated_playlist = await db.playlists.find_one({"id": playlist_id}, {"_id": 0})
    return PlaylistResponse(**updated_playlist)

@api_router.delete("/playlists/{playlist_id}")
async def delete_playlist(playlist_id: str, admin: dict = Depends(get_admin_user)):
    result = await db.playlists.delete_one({"id": playlist_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Playlist not found")
    return {"message": "Playlist deleted"}

# ============ Protected Routes (Logged-in Users) ============

@api_router.get("/channels", response_model=List[ChannelWithProvider])
async def get_all_channels(
    search: Optional[str] = None, 
    provider: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get all channels from all playlists, optionally filtered (requires login)"""
    playlists = await db.playlists.find({}, {"_id": 0}).to_list(100)
    
    all_channels = []
    for playlist in playlists:
        # Filter by provider if specified
        if provider and playlist["provider_name"].lower() != provider.lower():
            continue
            
        for channel in playlist["channels"]:
            channel_data = ChannelWithProvider(
                name=channel["name"],
                url=channel["url"],
                logo=channel.get("logo"),
                group=channel.get("group"),
                provider_name=playlist["provider_name"],
                playlist_id=playlist["id"]
            )
            
            # Filter by search term
            if search:
                search_lower = search.lower()
                if (search_lower not in channel["name"].lower() and 
                    search_lower not in (channel.get("group") or "").lower()):
                    continue
            
            all_channels.append(channel_data)
    
    return all_channels

@api_router.get("/providers")
async def get_providers(current_user: dict = Depends(get_current_user)):
    """Get list of all providers with channel counts (requires login)"""
    playlists = await db.playlists.find({}, {"_id": 0, "channels": 0}).to_list(100)
    return [{"name": p["provider_name"], "channel_count": p["channel_count"], "id": p["id"]} for p in playlists]

@api_router.get("/")
async def root():
    return {"message": "StreamVault API"}

# ============ Stream Proxy ============

@api_router.options("/proxy/stream")
async def proxy_stream_options():
    """Handle CORS preflight for proxy stream"""
    return {"message": "OK"}

@api_router.options("/proxy/m3u8")
async def proxy_m3u8_options():
    """Handle CORS preflight for proxy m3u8"""
    return {"message": "OK"}

@api_router.get("/proxy/stream")
async def proxy_stream(
    request: Request,
    url: str = Query(..., description="Stream URL to proxy"),
    token: Optional[str] = Query(None, description="Auth token")
):
    """Proxy a stream to bypass CORS restrictions"""
    # Verify token if provided (for security)
    if token:
        try:
            jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        except:
            raise HTTPException(status_code=401, detail="Invalid token")
    
    try:
        # Get Range header if present
        range_header = request.headers.get('Range', None)
        
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "*/*",
            "Accept-Language": "en-US,en;q=0.9",
            "Connection": "keep-alive",
        }
        
        if range_header:
            headers["Range"] = range_header
        
        async def stream_generator():
            async with httpx.AsyncClient(timeout=None, follow_redirects=True) as client:
                async with client.stream("GET", url, headers=headers) as response:
                    async for chunk in response.aiter_bytes(chunk_size=65536):
                        yield chunk
        
        # Determine content type based on URL
        content_type = "application/octet-stream"
        if ".m3u8" in url or ".m3u" in url:
            content_type = "application/vnd.apple.mpegurl"
        elif ".ts" in url:
            content_type = "video/mp2t"
        elif ".mp4" in url:
            content_type = "video/mp4"
        
        return StreamingResponse(
            stream_generator(),
            media_type=content_type,
            headers={
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "no-cache",
            }
        )
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch stream: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Proxy error: {str(e)}")

@api_router.get("/proxy/m3u8")
async def proxy_m3u8(
    url: str = Query(..., description="M3U8 URL to proxy"),
    api_base: str = Query("", description="API base URL for rewriting"),
    current_user: dict = Depends(get_current_user)
):
    """Proxy M3U8 playlist and rewrite URLs to go through proxy"""
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            response = await client.get(url, headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            })
            response.raise_for_status()
            content = response.text
            
            # Get base URL for relative paths
            from urllib.parse import urljoin, quote, unquote
            base_url = url.rsplit('/', 1)[0] + '/'
            
            # Decode api_base if provided
            decoded_api_base = unquote(api_base) if api_base else ""
            
            # Rewrite URLs in the M3U8 to go through our proxy
            lines = content.split('\n')
            rewritten_lines = []
            
            for line in lines:
                line = line.strip()
                if line and not line.startswith('#'):
                    # This is a URL line
                    if line.startswith('http'):
                        segment_url = line
                    else:
                        segment_url = urljoin(base_url, line)
                    
                    # Check if it's another m3u8 (sub-playlist) or a segment
                    encoded_url = quote(segment_url, safe='')
                    encoded_api_base = quote(decoded_api_base, safe='')
                    
                    if '.m3u8' in line.lower() or '.m3u' in line.lower():
                        # Sub-playlist - also proxy through m3u8 endpoint
                        if decoded_api_base:
                            rewritten_lines.append(f"{decoded_api_base}/proxy/m3u8?url={encoded_url}&api_base={encoded_api_base}")
                        else:
                            rewritten_lines.append(f"/api/proxy/m3u8?url={encoded_url}")
                    else:
                        # Media segment - proxy through stream endpoint  
                        if decoded_api_base:
                            rewritten_lines.append(f"{decoded_api_base}/proxy/stream?url={encoded_url}")
                        else:
                            rewritten_lines.append(f"/api/proxy/stream?url={encoded_url}")
                else:
                    rewritten_lines.append(line)
            
            rewritten_content = '\n'.join(rewritten_lines)
            
            return StreamingResponse(
                iter([rewritten_content.encode()]),
                media_type="application/vnd.apple.mpegurl",
                headers={
                    "Access-Control-Allow-Origin": "*",
                    "Cache-Control": "no-cache",
                }
            )
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch M3U8: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Proxy error: {str(e)}")

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
