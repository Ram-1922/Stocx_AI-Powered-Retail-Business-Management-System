let currentProfileData = null;
let selectedLogoFile = null;

// ==========================================
// DRAWER ANIMATIONS
// ==========================================

function openProfileDrawer() {
    const overlay = document.getElementById('profileOverlay');
    const modal = document.getElementById('profileModal'); 
    
    if (overlay && modal) {
        overlay.classList.replace('opacity-0', 'opacity-100');
        overlay.classList.replace('pointer-events-none', 'pointer-events-auto');
        
        // Bouncy Scale-in Effect
        modal.classList.replace('scale-95', 'scale-100');
        modal.classList.replace('opacity-0', 'opacity-100');
    }
    
    fetchProfileData(); 
}

function closeProfileDrawer() {
    const overlay = document.getElementById('profileOverlay');
    const modal = document.getElementById('profileModal');
    
    if (overlay && modal) {
        overlay.classList.replace('opacity-100', 'opacity-0');
        overlay.classList.replace('pointer-events-auto', 'pointer-events-none');
        
        // Scale-out Effect
        modal.classList.replace('scale-100', 'scale-95');
        modal.classList.replace('opacity-100', 'opacity-0');
    }
    
    setTimeout(cancelProfileEdit, 300);
}

// ==========================================
// FETCH & POPULATE PROFILE DATA
// ==========================================
async function fetchProfileData() {
    try {
        const res = await fetch('/api/profile/');
        if (res.ok) {
            const data = await res.json();
            currentProfileData = data;
            populateProfileUI(data);
        }
    } catch (e) {
        console.error("Failed to fetch profile. Make sure profile_api.py is registered in app.py.");
    }
}

function populateProfileUI(data) {
    // 1. Populate the Left Column Info
    document.getElementById('profileShopNameTitle').textContent = data.shop_name || 'My Shop';
    document.getElementById('profileEmailSubtitle').textContent = data.email || '';
    
    const fallbackImg = `https://ui-avatars.com/api/?name=${encodeURIComponent(data.shop_name || 'Shop')}&background=0ea5e9&color=fff`;
    const finalImg = data.logo_url || fallbackImg;
    document.getElementById('profileLogoPreview').src = finalImg;
    
    if (document.getElementById('navLogo')) document.getElementById('navLogo').src = finalImg;
    if (document.getElementById('navShopName')) document.getElementById('navShopName').textContent = data.shop_name || 'My Shop';

    // 2. Populate View Mode (Static Text)
    document.getElementById('viewShopName').textContent = data.shop_name || '-';
    document.getElementById('viewOwnerName').textContent = data.owner_name || '-';
    document.getElementById('viewCategory').textContent = data.category || 'Retail';
    document.getElementById('viewType').textContent = data.shop_type || 'Retail';
    document.getElementById('viewPhone').textContent = data.phone || '-';
    document.getElementById('viewAddress').textContent = data.address || '-';
    document.getElementById('viewBio').textContent = data.bio || 'No biographical info added yet.';

    // 3. Populate Edit Mode (Inputs)
    document.getElementById('profShopName').value = data.shop_name || '';
    document.getElementById('profOwnerName').value = data.owner_name || '';
    document.getElementById('profCategory').value = data.category || 'Other';
    document.getElementById('profType').value = data.shop_type || 'Retail';
    document.getElementById('profPhone').value = data.phone || '';
    document.getElementById('profAddress').value = data.address || '';
    document.getElementById('profBio').value = data.bio || '';
}

// ==========================================
// UI TOGGLES (VIEW <-> EDIT MODE)
// ==========================================
function enableProfileEdit() {
    // Hide View Elements
    document.querySelectorAll('[id^="view"]').forEach(el => el.classList.add('hidden'));
    
    // Show Edit Inputs
    document.querySelectorAll('[id^="prof"]').forEach(el => {
        if(el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') {
            el.classList.remove('hidden');
        }
    });

    // Show Photo Upload Button
    document.getElementById('editLogoBtn').classList.remove('hidden');
    document.getElementById('editLogoBtn').classList.add('flex');
    
    // Toggle Action Buttons
    document.getElementById('profEditBtn').classList.add('hidden');
    document.getElementById('profCancelBtn').classList.remove('hidden');
    document.getElementById('profSaveBtn').classList.remove('hidden');
}

function cancelProfileEdit() {
    // Show View Elements
    document.querySelectorAll('[id^="view"]').forEach(el => el.classList.remove('hidden'));
    
    // Hide Edit Inputs
    document.querySelectorAll('[id^="prof"]').forEach(el => {
        if(el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') {
            el.classList.add('hidden');
        }
    });

    // Hide Photo Upload Button
    document.getElementById('editLogoBtn').classList.add('hidden');
    document.getElementById('editLogoBtn').classList.remove('flex');
    
    // Toggle Action Buttons
    document.getElementById('profEditBtn').classList.remove('hidden');
    document.getElementById('profCancelBtn').classList.add('hidden');
    document.getElementById('profSaveBtn').classList.add('hidden');
    
    selectedLogoFile = null; 
    if (currentProfileData) populateProfileUI(currentProfileData); 
}

// ==========================================
// IMAGE PREVIEW
// ==========================================
function previewLogo(event) {
    const file = event.target.files[0];
    if (file) {
        selectedLogoFile = file;
        const reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById('profileLogoPreview').src = e.target.result;
        }
        reader.readAsDataURL(file);
    }
}

// ==========================================
// SAVE PROFILE LOGIC
// ==========================================
async function saveProfile() {
    const btn = document.getElementById('profSaveBtn');
    btn.disabled = true;
    btn.innerHTML = "Saving...";

    const formData = new FormData();
    formData.append('shop_name', document.getElementById('profShopName').value);
    formData.append('owner_name', document.getElementById('profOwnerName').value);
    formData.append('category', document.getElementById('profCategory').value);
    formData.append('shop_type', document.getElementById('profType').value);
    formData.append('phone', document.getElementById('profPhone').value);
    formData.append('address', document.getElementById('profAddress').value);
    formData.append('bio', document.getElementById('profBio').value);
    
    if (selectedLogoFile) formData.append('logo', selectedLogoFile);

    try {
        const res = await fetch('/api/profile/update', {
            method: 'POST',
            body: formData 
        });
        
        const result = await res.json();
        if (res.ok) {
            currentProfileData = result; 
            populateProfileUI(result);  
            cancelProfileEdit(); 
            
            // Reload page to reflect new logo globally if it was updated
            if (selectedLogoFile) {
                window.location.reload();
            }
        } else {
            alert(result.error || "Save failed.");
        }
    } catch (e) {
        alert("Network error. Failed to save profile.");
    } finally {
        btn.disabled = false;
        btn.innerHTML = "Save Changes";
    }
} 

// ==========================================
// LOGOUT LOGIC
// ==========================================
async function logoutUser() {
    try {
        const res = await fetch('/api/auth/logout', { method: 'POST' });
        if (res.ok) {
            window.location.reload(); 
        }
    } catch (error) {
        console.error("Logout failed", error);
    }
}


// ==========================================
// AUTH MODAL UI LOGIC
// ==========================================
function openAuthModal() {
    const overlay = document.getElementById('authOverlay');
    const modal = document.getElementById('authModal');
    
    overlay.classList.replace('opacity-0', 'opacity-100');
    overlay.classList.replace('pointer-events-none', 'pointer-events-auto');
    
    modal.classList.replace('scale-95', 'scale-100');
    modal.classList.replace('opacity-0', 'opacity-100');
    
    switchAuthView('authLoginView');
}

function closeAuthModal() {
    const overlay = document.getElementById('authOverlay');
    const modal = document.getElementById('authModal');
    
    overlay.classList.replace('opacity-100', 'opacity-0');
    overlay.classList.replace('pointer-events-auto', 'pointer-events-none');
    
    modal.classList.replace('scale-100', 'scale-95');
    modal.classList.replace('opacity-100', 'opacity-0');
}

function switchAuthView(viewId) {
    ['authLoginView', 'authRegPhase1', 'authRegPhase2'].forEach(id => {
        document.getElementById(id).classList.add('hidden');
    });
    
    const target = document.getElementById(viewId);
    target.classList.remove('hidden');
    target.style.opacity = '0';
    setTimeout(() => target.style.opacity = '1', 10);
    
    // Auto-focus first input of the new view
    const firstInput = target.querySelector('input');
    if (firstInput) setTimeout(() => firstInput.focus(), 150);
}


// ==========================================
// AUTH API FETCH LOGIC
// ==========================================

// LOGIN
document.getElementById('loginBtn').addEventListener('click', async () => {
    const shop_name = document.getElementById('loginShop').value;
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const errDiv = document.getElementById('loginError');
    
    if (!shop_name || !email || !password) { errDiv.textContent = "Please fill all fields."; return; }
    
    document.getElementById('loginBtn').textContent = "Logging in...";
    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shop_name, email, password })
        });
        const data = await res.json();
        
        if (res.ok) window.location.reload(); 
        else errDiv.textContent = data.error;
    } catch (e) { errDiv.textContent = "Server error."; }
    document.getElementById('loginBtn').textContent = "Log in";
});

// ==========================================
// OTP PASSCODE LOGIC & TIMER
// ==========================================
const sendOtpBtn = document.getElementById('sendOtpBtn');
const resendOtpBtn = document.getElementById('resendOtpBtn');
const otpTimerText = document.getElementById('otpTimerText');
let otpTimerInterval;
let otpTimeLeft = 60;

function startOtpTimer() {
    clearInterval(otpTimerInterval);
    otpTimeLeft = 60;
    
    otpTimerText.classList.remove('hidden');
    resendOtpBtn.classList.add('hidden');
    otpTimerText.textContent = `01:00`;

    otpTimerInterval = setInterval(() => {
        otpTimeLeft--;
        const seconds = otpTimeLeft < 10 ? `0${otpTimeLeft}` : otpTimeLeft;
        otpTimerText.textContent = `00:${seconds}`;
        
        if (otpTimeLeft <= 0) {
            clearInterval(otpTimerInterval);
            otpTimerText.classList.add('hidden');
            resendOtpBtn.classList.remove('hidden');
        }
    }, 1000);
}

async function requestOtp(buttonElem) {
    const email = document.getElementById('regEmail').value.trim();
    const errDiv = document.getElementById('regError1');
    const originalText = buttonElem.textContent;
    
    if (!email) {
        errDiv.textContent = "Please enter an email address first.";
        errDiv.classList.replace('text-brand-500', 'text-rose-500');
        return;
    }
    
    buttonElem.disabled = true;
    buttonElem.textContent = "Sending...";
    
    try {
        const res = await fetch('/api/auth/send-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const data = await res.json();
        
        if (res.ok) {
            const otpGrp = document.getElementById('otpGroup');
            otpGrp.classList.remove('hidden');
            // Tiny timeout allows display block to render before firing CSS transition
            setTimeout(() => { otpGrp.classList.remove('opacity-0', 'translate-y-[-10px]'); }, 10);
            
            errDiv.classList.replace('text-rose-500', 'text-brand-500');
            errDiv.textContent = data.message;
            if (sendOtpBtn) sendOtpBtn.textContent = "Sent ✓";
            
            document.getElementById('regOtp').focus();
            startOtpTimer();
        } else {
            errDiv.classList.replace('text-brand-500', 'text-rose-500');
            errDiv.textContent = data.error || "Failed to send passcode.";
            buttonElem.textContent = originalText;
        }
    } catch (e) {
        errDiv.classList.replace('text-brand-500', 'text-rose-500');
        errDiv.textContent = "Server error while requesting passcode.";
        buttonElem.textContent = originalText;
    } finally {
        buttonElem.disabled = false;
    }
}

if (sendOtpBtn) sendOtpBtn.addEventListener('click', () => requestOtp(sendOtpBtn));
if (resendOtpBtn) resendOtpBtn.addEventListener('click', () => requestOtp(resendOtpBtn));


// REGISTRATION PHASE 1 (Validation & API Passcode Check)
document.getElementById('nextPhaseBtn').addEventListener('click', async () => {
    const email = document.getElementById('regEmail').value.trim();
    const pass = document.getElementById('regPassword').value;
    const conf = document.getElementById('regConfirm').value;
    const otp = document.getElementById('regOtp').value.trim(); 
    const errDiv = document.getElementById('regError1');
    const btn = document.getElementById('nextPhaseBtn');

    errDiv.classList.replace('text-brand-500', 'text-rose-500');

    if (!email || !pass || !conf || !otp) {
        errDiv.textContent = "Please fill all fields and enter your Passcode.";
        return;
    }
    if (pass !== conf) {
        errDiv.textContent = "Passwords do not match.";
        return;
    }
    if (pass.length < 6) {
        errDiv.textContent = "Password must be at least 6 characters.";
        return;
    }

    btn.disabled = true;
    btn.textContent = "Verifying Passcode...";

    try {
        const res = await fetch('/api/auth/verify-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, otp })
        });
        
        const data = await res.json();
        
        if (res.ok) {
            errDiv.textContent = "";
            switchAuthView('authRegPhase2');
        } else {
            errDiv.textContent = data.error;
        }
    } catch (e) {
        errDiv.textContent = "Server error while verifying passcode.";
    } finally {
        btn.disabled = false;
        btn.textContent = "Next: Business Details →";
    }
});

// REGISTRATION PHASE 2 (Final Submit)
document.getElementById('submitRegBtn').addEventListener('click', async () => {
    const errDiv = document.getElementById('regError2');
    errDiv.textContent = "";

    const payload = {
        email: document.getElementById('regEmail').value.trim(),
        password: document.getElementById('regPassword').value,
        otp: document.getElementById('regOtp').value.trim(),
        shop_name: document.getElementById('regShopName').value.trim(),
        owner_name: document.getElementById('regOwner').value.trim(),
        contact_no: document.getElementById('regContact').value.trim(),
        shop_type: document.getElementById('regShopType').value.trim(),
        category: document.getElementById('regCategory').value.trim(),
        address: document.getElementById('regAddress').value.trim()
    };

    if (!payload.shop_name || !payload.owner_name || !payload.contact_no || 
        !payload.shop_type || !payload.category || !payload.address) {
        errDiv.textContent = "Please fill in all fields."; 
        return;
    }

    document.getElementById('submitRegBtn').textContent = "Creating Account...";
    try {
        const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        
        if (res.ok) window.location.reload(); 
        else {
            switchAuthView('authRegPhase1'); 
            document.getElementById('regError1').textContent = data.error;
            document.getElementById('regError1').classList.replace('text-brand-500', 'text-rose-500');
        }
    } catch (e) { errDiv.textContent = "Server error."; }
    document.getElementById('submitRegBtn').textContent = "Complete Setup ✓";
});

// ==========================================
// KEYBOARD ACCESSIBILITY (ENTER KEY Navigation)
// ==========================================

function setupEnterNavigation(inputIds, submitBtnId) {
    inputIds.forEach((inputId, index) => {
        const el = document.getElementById(inputId);
        if (!el) return;
        
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault(); 
                
                if (index < inputIds.length - 1) {
                    const nextEl = document.getElementById(inputIds[index + 1]);
                    if (nextEl) {
                        // Skip hidden elements (like OTP field if it's not visible yet)
                        if (nextEl.closest('.hidden')) {
                             document.getElementById(submitBtnId).click();
                        } else {
                            nextEl.focus();
                        }
                    }
                } else {
                    document.getElementById(submitBtnId).click();
                }
            }
        });
    });
}

// 1. Map Enter Key for Login
setupEnterNavigation(['loginShop', 'loginEmail', 'loginPassword'], 'loginBtn');

// 2. Map Enter Key for Registration Phase 1
// Note: We map regEmail to sendOtpBtn. If they press enter on email, it requests the OTP!
const emailInput = document.getElementById('regEmail');
if(emailInput) {
    emailInput.addEventListener('keydown', (e) => {
        if(e.key === 'Enter') {
            e.preventDefault();
            document.getElementById('sendOtpBtn').click();
        }
    });
}
setupEnterNavigation(['regOtp', 'regPassword', 'regConfirm'], 'nextPhaseBtn');

// 3. Map Enter Key for Registration Phase 2
setupEnterNavigation(['regShopName', 'regOwner', 'regContact', 'regShopType', 'regCategory', 'regAddress'], 'submitRegBtn');

// ==========================================
// FIREBASE GOOGLE LOGIN LOGIC
// ==========================================

// 1. Initialize Firebase (Replace with your actual Firebase config)
const firebaseConfig = {
  apiKey: "AIzaSyAwJt-K948VW99rewauDGVhekx1_NK4xZY",
  authDomain: "stocx-by-spidey.firebaseapp.com",
  projectId: "stocx-by-spidey",
  storageBucket: "stocx-by-spidey.firebasestorage.app",
  messagingSenderId: "181233593436",
  appId: "1:181233593436:web:e7ef77932279af8e770a99",
  measurementId: "G-R642HE3FB7"
};

// Ensure Firebase isn't initialized twice
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const googleLoginBtn = document.getElementById('googleLoginBtn');

if (googleLoginBtn) {
    googleLoginBtn.addEventListener('click', async () => {
        const errDiv = document.getElementById('loginError');
        const provider = new firebase.auth.GoogleAuthProvider();
        
        try {
            // CRITICAL: Trigger the popup FIRST before any DOM changes!
            // This prevents browsers from blocking the popup.
            const result = await firebase.auth().signInWithPopup(provider);
            const user = result.user;

            // NOW we can show the loading state while we talk to our backend
            googleLoginBtn.disabled = true;
            googleLoginBtn.innerHTML = '<span class="animate-pulse">Syncing Account...</span>';

            const res = await fetch('/api/auth/google-login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: user.email,
                    name: user.displayName,
                    uid: user.uid
                })
            });

            const data = await res.json();
            
            if (res.ok) {
                window.location.reload(); 
            } else {
                errDiv.textContent = data.error || "Google login failed on server.";
                errDiv.classList.replace('text-brand-500', 'text-rose-500');
                resetGoogleButton();
            }
            
        } catch (error) {
            console.error("Google Auth Error:", error);
            
            // Only show error if they didn't just close the window manually
            if (error.code !== 'auth/popup-closed-by-user') {
                errDiv.textContent = "Google login failed or was blocked by browser.";
                errDiv.classList.replace('text-brand-500', 'text-rose-500');
            }
            resetGoogleButton();
        }
    });
}

function resetGoogleButton() {
    if (googleLoginBtn) {
        googleLoginBtn.disabled = false;
        googleLoginBtn.innerHTML = '<img src="https://img.icons8.com/color/20/000000/google-logo.png" alt="Google"> Google';
    }
}