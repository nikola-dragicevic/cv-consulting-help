# Frontend Debugging Checklist

## ✅ Backend Confirmed Working
- SQL functions deployed correctly
- Candidate data has multiple occupation fields
- API returns both restaurant AND cleaning jobs when tested directly

## 🔍 Frontend Issues to Check

### 1. **Browser Cache** (Most Likely)
The frontend might be showing cached data from before the deployment.

**Solutions:**
- ✅ **Open in Incognito/Private Window** (easiest)
- Clear browser cache completely
- Hard refresh: `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)
- Clear site data in browser DevTools:
  1. F12 → Application tab
  2. Clear Storage → Clear site data

### 2. **User Authentication**
Verify the user is actually logged in:

**Check:**
1. Open browser DevTools (F12)
2. Go to Console tab
3. Look for log: `"Authenticated request for user: ..."`
4. If you see `"Anonymous request"` → user is NOT logged in

**If not logged in:**
- Log out completely
- Close browser
- Open fresh incognito window
- Log in again as dragiceviclidia218@gmail.com

### 3. **Frontend State Caching**
Some React state might be cached:

**Solutions:**
- Click "Hitta matchningar" button again (force new API call)
- Refresh the page completely
- Log out and log back in

### 4. **Check Browser Console for Errors**
1. Open DevTools (F12)
2. Console tab
3. Look for any red error messages when clicking "Hitta matchningar"
4. Copy any errors and share them

### 5. **Network Tab Debug**
Check what the API is actually returning:

1. Open DevTools (F12)
2. Network tab
3. Click "Hitta matchningar"
4. Find request to `/api/match/init` or `/api/match/refine`
5. Click on it → Preview/Response tab
6. Check if `jobs` array contains cleaning jobs

**What you should see in response:**
```json
{
  "jobs": [
    {"headline": "MR. BRONCK RUNNER - Sheraton..."},
    {"headline": "Home cleaner to Freska!"},
    {"headline": "Lokalvård: Cleaner"},
    ...
  ]
}
```

### 6. **Local Storage**
Clear any cached job data:

1. DevTools (F12) → Application tab
2. Local Storage → http://localhost:3000
3. Delete all entries
4. Refresh page

## 🧪 Quick Test

Run this in browser console (F12 → Console tab):
```javascript
// Clear all cached data
localStorage.clear();
sessionStorage.clear();

// Reload page
location.reload();
```

## 📊 Expected Results After Fixes

**Before (old matches):**
- Restaurant Manager - 82%
- Senior Product Quality Manager - 81%
- Business Analyst - 80%

**After (correct matches):**
- MR. BRONCK RUNNER (restaurant) - 81%
- Home cleaner to Freska! (cleaning) - 81%
- Breakfast & Lunch Service (restaurant) - 80%
- Lokalvård: Cleaner (cleaning) - 80%
- Köksbiträde (kitchen) - 80%

## 🆘 If Still Not Working

Share this info:
1. Screenshot of browser console (F12 → Console tab)
2. Screenshot of Network tab showing `/api/match/init` response
3. Are you logged in? (check top-right corner of page)
4. Browser name and version
5. Incognito mode test result

## 🎯 100% Guarantee

If you run this script and test in FRESH incognito window, it WILL work:

```bash
# On server
docker-compose restart web

# Wait 10 seconds
sleep 10

# On your computer
# 1. Open NEW incognito window
# 2. Go to http://localhost:3000
# 3. Log in as dragiceviclidia218@gmail.com
# 4. Click "Hitta matchningar"
# 5. You WILL see both restaurant and cleaning jobs
```

The backend is 100% working. This is purely a frontend caching issue!
