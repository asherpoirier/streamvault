# StreamVault - M3U8 Playlist Manager PRD

## Original Problem Statement
Create a webapp that takes a provider M3U8 list and displays the channels. The admin of the site can add multiple playlists. There should be a search filter that the user can search for a specific channel and playlists will display the link for the channel.

## User Choices
1. Simple JWT-based custom auth for admin
2. Admins paste M3U8 URL directly
3. Display/copy stream URL with VLC open option (vlc:// protocol)
4. Dark theme (modern streaming look)
5. Playlists grouped by provider
6. **Users must login to view channels/providers**
7. **Only admin can create user accounts** (no self-registration)

## User Personas
- **Admin**: Manages M3U8 playlist sources, adds/refreshes/deletes providers
- **User**: Must login to browse channels, search, filter by provider, copy URLs or open in VLC

## Core Requirements
- JWT authentication for all users (required to view content)
- Admin-only playlist management
- M3U8 URL parsing and channel extraction
- Channel search and provider filtering
- Copy stream URL functionality
- Open in VLC via protocol handler
- Dark theme with glassmorphism UI

## Architecture
- **Backend**: FastAPI + MongoDB + Motor (async driver)
- **Frontend**: React + Tailwind CSS + Shadcn UI
- **Auth**: JWT tokens with bcrypt password hashing

## What's Been Implemented (January 2, 2026)
- [x] JWT authentication (login only - no self-registration)
- [x] First admin setup via /api/auth/setup endpoint
- [x] **Admin-only user creation** (Manage Users tab)
- [x] **Login required to view channels/providers**
- [x] M3U8 URL parsing with channel extraction
- [x] Admin dashboard for playlist CRUD
- [x] Admin dashboard for user management (create/delete users)
- [x] Protected channel browser with search
- [x] Provider filter buttons
- [x] Copy URL to clipboard
- [x] Open in VLC (vlc:// protocol)
- [x] Channels grouped by provider
- [x] Dark theme with neon accents
- [x] Session persistence across reloads
- [x] Playlist refresh functionality
- [x] Removed Emergent watermark

## API Endpoints
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login and get JWT token
- `GET /api/auth/me` - Get current user info
- `POST /api/playlists` - Add new playlist (admin only)
- `GET /api/playlists` - List all playlists (admin only)
- `PUT /api/playlists/{id}/refresh` - Refresh playlist channels (admin only)
- `DELETE /api/playlists/{id}` - Delete playlist (admin only)
- `GET /api/channels` - Channel list with search/filter (requires login)
- `GET /api/providers` - List all providers (requires login)

## Prioritized Backlog
### P0 (Critical)
- All features implemented ✅

### P1 (High Priority)
- [ ] Bulk playlist import
- [ ] Channel favorites/bookmarks
- [ ] EPG (Electronic Program Guide) support

### P2 (Medium Priority)
- [ ] Multiple admin users management
- [ ] Playlist categories/tags
- [ ] Export playlist functionality
- [ ] Channel status checking (online/offline)

### P3 (Nice to Have)
- [ ] Embedded video player option
- [ ] Mobile-responsive improvements
- [ ] Dark/light theme toggle
- [ ] Channel statistics/analytics

## Next Tasks
1. Consider adding channel favorites for users
2. Add EPG support for program schedules
3. Implement playlist import from file upload
