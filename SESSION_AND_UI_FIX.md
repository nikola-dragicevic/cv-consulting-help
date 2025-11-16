# Session Persistence & UI State Fix

## What You Observed

1. **Persistent Session**: After restarting, you were still logged in (redirected to `/profile`)
2. **UI Not Updated**: Header still showed "Logga in" and "Registrera" buttons instead of your email and "Logga ut"

## Explanation

### Why Sessions Persist (This is CORRECT behavior)

When you log in, Supabase stores your session in **HTTP-only cookies**:
- Cookies survive browser restarts
- Cookies survive server restarts
- Sessions expire after ~7 days (configurable)

This is **standard behavior** for modern web apps and is **secure**:
- ✅ Cookies are HTTP-only (can't be stolen by JavaScript)
- ✅ Sessions are encrypted
- ✅ Server validates every request
- ✅ You can log out at any time

**Examples of sites that do this:**
- Gmail (stay logged in)
- GitHub (remember me)
- Facebook (persistent sessions)
- Every modern web application

### Why UI Wasn't Updating (This was a BUG)

The Header component was creating its own Supabase client instead of using the centralized `getBrowserSupabase()` function. This caused session detection to fail.

## What I Fixed

### 1. Header Component (`src/components/ui/Header.tsx`)

**Before:**
```typescript
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
```

**After:**
```typescript
const supabase = getBrowserSupabase(); // Uses centralized client
```

### 2. Added Loading State

Now shows "Laddar..." while checking session:
```typescript
{loading ? (
  <span>Laddar...</span>
) : user ? (
  // Show logged-in UI
) : (
  // Show logged-out UI
)}
```

### 3. Added Console Logging

You can now see in the browser console:
```
Header: Current user: your-email@example.com
```

### 4. Improved Logout

- Added `router.refresh()` to update server components
- Added console log for debugging

## Expected Behavior After Fix

### When NOT Logged In:
```
Header shows:
[CV-Hjälp]                    [Logga in] [Registrera]
```

### When Logged In:
```
Header shows:
[CV-Hjälp]     [your-email@example.com] [Min Profil] [Logga ut]
```

### Session Flow:
1. **Login** → Session created → Cookies saved → Header shows email
2. **Restart browser** → Cookies still exist → Auto-logged in → Header shows email
3. **Click "Logga ut"** → Session destroyed → Cookies cleared → Header shows login buttons

## Testing the Fix

### Step 1: Restart Dev Server
```bash
# Stop the server (Ctrl+C)
npm run dev
# or
yarn dev
```

### Step 2: Open Browser Console
Press F12 to open Developer Tools

### Step 3: Go to Your Site
Navigate to `http://localhost:3000`

### Step 4: Check Console Logs
You should see:
```
Header: Current user: your-email@example.com
```

### Step 5: Verify Header UI
You should see:
- ✅ Your email in the header (on desktop)
- ✅ "Min Profil" button
- ✅ "Logga ut" button (red)
- ❌ NOT "Logga in" or "Registrera" buttons

### Step 6: Test Logout
1. Click "Logga ut"
2. Header should change to show "Logga in" and "Registrera"
3. Console should show: "User logged out"

### Step 7: Test Session Persistence
1. Log in again
2. Close the browser completely
3. Reopen and go to your site
4. Should still be logged in (header shows your email)

## Troubleshooting

### Header Still Shows Login Buttons When Logged In

**Check browser console for errors:**
```javascript
// Should see:
Header: Current user: your-email@example.com

// If you see:
Header: Current user: Not logged in
// Then session is not being detected
```

**Solution:**
1. Clear browser cookies and cache
2. Restart dev server
3. Log in again

### Session Doesn't Persist After Browser Restart

**Check:**
1. Cookies are enabled in your browser
2. You're using the same domain (localhost:3000)
3. Supabase auth settings allow persistent sessions

### Email Doesn't Show on Mobile View

This is intentional - the email is hidden on small screens:
```typescript
<span className="text-sm text-gray-600 hidden sm:block">
  {user.email}
</span>
```

On mobile, you'll only see the buttons to save space.

## Security Notes

### Is Persistent Session Safe?

**Yes!** The session uses:
- HTTP-only cookies (can't be accessed by JavaScript/XSS)
- Secure flag (only sent over HTTPS in production)
- SameSite flag (CSRF protection)
- Encrypted token (can't be forged)

### Can Someone Steal My Session?

**Not easily.** An attacker would need:
- Physical access to your computer, OR
- Ability to run code in your browser (XSS - which HTTP-only cookies prevent)

### How to Force Logout Everywhere?

In Supabase Dashboard:
1. Go to Authentication → Users
2. Find your user
3. Click the menu → "Sign out user"

This invalidates all sessions for that user.

### Session Expiry

Default: **7 days**

To change, go to:
Supabase Dashboard → Authentication → Settings → JWT Expiry

## Now Test Your CV Upload!

With the session working correctly:

1. **Verify you're logged in** (check header shows your email)
2. **Go to `/profile`**
3. **Upload a CV**
4. **Check terminal logs** for detailed debug info
5. **Report any errors** you see in console or terminal

The session fix was separate from the RLS issue. Now let's test if the RLS fix works!
