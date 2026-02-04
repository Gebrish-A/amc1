// public/js/language-service.js - Complete Language Translation Service
class LanguageService {
    constructor() {
        this.currentLanguage = localStorage.getItem('preferredLanguage') || 'en';
        this.translations = this.getTranslations();
        this.dir = this.currentLanguage === 'am' ? 'rtl' : 'ltr';
    }

    getTranslations() {
        return {
            en: {
                // Login Page
                'companyName': 'Amhara Media Corporation',
                'tagline': 'Content Management System',
                'selectRole': 'Select Your Role',
                'reporter': 'Reporter',
                'reporterDesc': 'Field reporting and content creation',
                'editor': 'Editor',
                'editorDesc': 'Review, edit, and publish content',
                'crew': 'Crew Member',
                'crewDesc': 'Technical and production support',
                'requester': 'Content Requester',
                'requesterDesc': 'Request and manage content creation',
                'admin': 'Administrator',
                'adminDesc': 'System management and administration',
                'loginTitle': 'Login to Your Account',
                'accessDashboard': 'Access your dashboard',
                'emailLabel': 'Email Address',
                'emailPlaceholder': 'Enter your email address',
                'passwordLabel': 'Password',
                'passwordPlaceholder': 'Enter your password',
                'rememberMe': 'Remember me',
                'forgotPassword': 'Forgot Password?',
                'signIn': 'Sign In',
                'backToRole': 'Back to Role Selection',
                'noAccount': 'Don\'t have an account?',
                'registerHere': 'Register here',
                'selectedRole': 'selected',
                'signingIn': 'Signing In...',

                // Dashboard
                'welcome': 'Welcome',
                'dashboard': 'Dashboard',
                'analytics': 'Analytics',
                'requests': 'Requests',
                'resources': 'Resources',
                'calendar': 'Calendar',
                'reports': 'Reports',
                'notifications': 'Notifications',
                'profile': 'Profile',
                'logout': 'Logout',

                // Common
                'loading': 'Loading...',
                'success': 'Success',
                'error': 'Error',
                'warning': 'Warning',
                'info': 'Info',
                'save': 'Save',
                'cancel': 'Cancel',
                'delete': 'Delete',
                'edit': 'Edit',
                'view': 'View',
                'submit': 'Submit',
                'reset': 'Reset',
                'search': 'Search',
                'filter': 'Filter',
                'export': 'Export',
                'import': 'Import',
                'download': 'Download',
                'upload': 'Upload',
                'print': 'Print',
                'refresh': 'Refresh',
                'addNew': 'Add New',
                'create': 'Create',
                'update': 'Update',
                'close': 'Close',
                'confirm': 'Confirm',
                'back': 'Back',
                'next': 'Next',
                'previous': 'Previous',
                'first': 'First',
                'last': 'Last',
                'of': 'of',
                'results': 'results',
                'items': 'items',
                'page': 'Page',

                // Messages
                'welcomeBack': 'Welcome back',
                'loginFailed': 'Login failed',
                'invalidCredentials': 'Invalid email or password',
                'networkError': 'Network error',
                'accountNotFound': 'Account not found',
                'successMessage': 'Operation completed successfully',
                'errorMessage': 'An error occurred',
                'warningMessage': 'Please check your input',
                'infoMessage': 'Information',

                // Months
                'january': 'January',
                'february': 'February',
                'march': 'March',
                'april': 'April',
                'may': 'May',
                'june': 'June',
                'july': 'July',
                'august': 'August',
                'september': 'September',
                'october': 'October',
                'november': 'November',
                'december': 'December',

                // Days
                'sunday': 'Sunday',
                'monday': 'Monday',
                'tuesday': 'Tuesday',
                'wednesday': 'Wednesday',
                'thursday': 'Thursday',
                'friday': 'Friday',
                'saturday': 'Saturday',
                // langu
                // Add these inside the 'en' object:
                'butAccountIs': 'but your account is',
                'selectCorrectRole': 'Please select the correct role.',
                'signingIn': 'Signing In...',
                'redirectingAdmin': 'Redirecting to Admin Dashboard...',
                'redirectingReporter': 'Redirecting to Reporter Dashboard...',
                'redirectingRequester': 'Redirecting to Requester Dashboard...',
                'redirectingEditor': 'Redirecting to Editor Dashboard...',
                'redirectingCrew': 'Redirecting to Crew Dashboard...',
                // Time
                'today': 'Today',
                'yesterday': 'Yesterday',
                'tomorrow': 'Tomorrow',
                'thisWeek': 'This Week',
                'lastWeek': 'Last Week',
                'nextWeek': 'Next Week',
                'thisMonth': 'This Month',
                'lastMonth': 'Last Month',
                'nextMonth': 'Next Month',
                'thisYear': 'This Year',
                'lastYear': 'Last Year',
                'nextYear': 'Next Year',
                // Add these inside the 'en' object:
                'butAccountIs': 'but your account is',
                'selectCorrectRole': 'Please select the correct role.',
                'signingIn': 'Signing In...',
                'redirectingAdmin': 'Redirecting to Admin Dashboard...',
                'redirectingReporter': 'Redirecting to Reporter Dashboard...',
                'redirectingRequester': 'Redirecting to Requester Dashboard...',
                'redirectingEditor': 'Redirecting to Editor Dashboard...',
                'redirectingCrew': 'Redirecting to Crew Dashboard...',
                // Registration Page
                'registerTitle': 'Create Your Account',
                'fullName': 'Full Name',
                'fullNamePlaceholder': 'Enter your full name',
                'fullNameHint': 'Enter your complete name as it appears officially',
                'phoneLabel': 'Phone Number',
                'phonePlaceholder': '+251XXXXXXXXX',
                'phoneHint': 'Ethiopian format: +251 followed by 9 digits',
                'confirmPassword': 'Confirm Password',
                'confirmPasswordPlaceholder': 'Confirm your password',
                'termsAgreement': 'I agree to the Terms of Service and Privacy Policy',
                'createAccount': 'Create Account',
                'haveAccount': 'Already have an account?',
                'loginHere': 'Login here',

            },
            am: {
                //langu
                // Add these inside the 'am' object:
                'butAccountIs': 'ግን አካውንትዎ',
                'selectCorrectRole': 'እባክዎ ትክክለኛውን ሚና ይምረጡ።',
                'signingIn': 'እየገባ...',
                'redirectingAdmin': 'ወደ አስተዳዳሪ ዳሽቦርድ በመዞር ላይ...',
                'redirectingReporter': 'ወደ ሪፖርተር ዳሽቦርድ በመዞር ላይ...',
                'redirectingRequester': 'ወደ ጠያቂ ዳሽቦርድ በመዞር ላይ...',
                'redirectingEditor': 'ወደ አርታዒ ዳሽቦርድ በመዞር ላይ...',
                'redirectingCrew': 'ወደ ቡድን ዳሽቦርድ በመዞር ላይ...',
                // Dashboard - Amharic
                // Registration Page - Amharic
                'registerTitle': 'አካውንትዎን ይፍጠሩ',
                'fullName': 'ሙሉ ስም',
                'fullNamePlaceholder': 'ሙሉ ስምዎን ያስገቡ',
                'fullNameHint': 'በመደበኛነት የሚታየውን ሙሉ ስምዎን ያስገቡ',
                'phoneLabel': 'ስልክ ቁጥር',
                'phonePlaceholder': '+251XXXXXXXXX',
                'phoneHint': 'ኢትዮጵያዊ ቅርፅ: +251 ተከትሎ 9 አሃዞች',
                'confirmPassword': 'የይለፍ ቃል አረጋግጥ',
                'confirmPasswordPlaceholder': 'የይለፍ ቃልዎን አረጋግጥ',
                'termsAgreement': 'የአገልግሎት ውሎችን እና የግላዊነት ፖሊሲውን እቀበላለሁ',
                'createAccount': 'አካውንት ፍጠር',
                'haveAccount': 'ቀድሞውኑ አካውንት አለዎት?',
                'loginHere': 'እዚህ ይግቡ',
                // Dashboard - Amharic
                // Login Page - Amharic
                'companyName': 'አማራ ሚዲያ ኮርፖሬሽን',
                'tagline': 'የይዘት አስተዳደር ስርዓት',
                'selectRole': 'ሚናዎን ይምረጡ',
                'reporter': 'ሪፖርተር',
                'reporterDesc': 'መስክ ሪፖርት እና ይዘት ፍጠር',
                'editor': 'አርታዒ',
                'editorDesc': 'ይዘትን ይገምግሙ፣ ያርትዑ እና ያትሙ',
                'crew': 'የቡድን አባል',
                'crewDesc': 'ቴክኒካል እና የምርት ድጋፍ',
                'requester': 'የይዘት ጠያቂ',
                'requesterDesc': 'የይዘት ፍጠር ይጠይቁ እና ያስተዳድሩ',
                'admin': 'አስተዳዳሪ',
                'adminDesc': 'የስርዓት አስተዳደር',
                'loginTitle': 'ወደ አካውንትዎ ይግቡ',
                'accessDashboard': 'ዳሽቦርድዎን ይድረሱ',
                'emailLabel': 'ኢሜል አድራሻ',
                'emailPlaceholder': 'ኢሜል አድራሻዎን ያስገቡ',
                'passwordLabel': 'የይለፍ ቃል',
                'passwordPlaceholder': 'የይለፍ ቃልዎን ያስገቡ',
                'rememberMe': 'አስታውሰኝ',
                'forgotPassword': 'የይለፍ ቃል ረሳሁ?',
                'signIn': 'ግባ',
                'backToRole': 'ወደ ሚና ምረጥ ተመለስ',
                'noAccount': 'አካውንት የለህም?',
                'registerHere': 'እዚህ ይመዝገቡ',
                'selectedRole': 'ተመርጧል',
                'signingIn': 'እየገባ...',
                //langu
                // Add these inside the 'am' object:
                'butAccountIs': 'ግን አካውንትዎ',
                'selectCorrectRole': 'እባክዎ ትክክለኛውን ሚና ይምረጡ።',
                'signingIn': 'እየገባ...',
                'redirectingAdmin': 'ወደ አስተዳዳሪ ዳሽቦርድ በመዞር ላይ...',
                'redirectingReporter': 'ወደ ሪፖርተር ዳሽቦርድ በመዞር ላይ...',
                'redirectingRequester': 'ወደ ጠያቂ ዳሽቦርድ በመዞር ላይ...',
                'redirectingEditor': 'ወደ አርታዒ ዳሽቦርድ በመዞር ላይ...',
                'redirectingCrew': 'ወደ ቡድን ዳሽቦርድ በመዞር ላይ...',
                // Dashboard - Amharic
                'welcome': 'እንኳን ደህና መጡ',
                'dashboard': 'ዳሽቦርድ',
                'analytics': 'ትንታኔ',
                'requests': 'ጥያቄዎች',
                'resources': 'መሳሪያዎች',
                'calendar': 'ቀን መቁጠሪያ',
                'reports': 'ሪፖርቶች',
                'notifications': 'ማሳወቂያዎች',
                'profile': 'መገለጫ',
                'logout': 'ውጣ',

                // Common - Amharic
                'loading': 'እየጫነ...',
                'success': 'በሚገባ',
                'error': 'ስህተት',
                'warning': 'ማስጠንቀቂያ',
                'info': 'መረጃ',
                'save': 'አስቀምጥ',
                'cancel': 'ሰርዝ',
                'delete': 'ሰርዝ',
                'edit': 'አርትእ',
                'view': 'ተመልከት',
                'submit': 'አስገባ',
                'reset': 'እንደገና ጀምር',
                'search': 'ፈልግ',
                'filter': 'አጣራ',
                'export': 'ላክ',
                'import': 'አምጣ',
                'download': 'ወርድ',
                'upload': 'ጫን',
                'print': 'አትም',
                'refresh': 'አድስ',
                'addNew': 'አዲስ ጨምር',
                'create': 'ፍጠር',
                'update': 'አዘምን',
                'close': 'ዝጋ',
                'confirm': 'አረጋግጥ',
                'back': 'ተመለስ',
                'next': 'ቀጣይ',
                'previous': 'ቀዳሚ',
                'first': 'መጀመሪያ',
                'last': 'መጨረሻ',
                'of': 'ከ',
                'results': 'ውጤቶች',
                'items': 'እቃዎች',
                'page': 'ገፅ',

                // Messages - Amharic
                'welcomeBack': 'እንኳን ደህና መጡ',
                'loginFailed': 'መግባት አልተሳካም',
                'invalidCredentials': 'የተሳሳተ ኢሜል ወይም የይለፍ ቃል',
                'networkError': 'የኔትወርክ ስህተት',
                'accountNotFound': 'አካውንት አልተገኘም',
                'successMessage': 'ክዋኔው በሚገባ ተጠናቅቋል',
                'errorMessage': 'ስህተት ተፈጥሯል',
                'warningMessage': 'እባክዎ ግብአትዎን ያረጋግጡ',
                'infoMessage': 'መረጃ',

                // Months - Amharic (Ethiopian)
                'january': 'ጃንዩዌሪ',
                'february': 'ፌብሩዌሪ',
                'march': 'ማርች',
                'april': 'ኤፕሪል',
                'may': 'ሜይ',
                'june': 'ጁን',
                'july': 'ጁላይ',
                'august': 'ኦገስት',
                'september': 'ሴፕቴምበር',
                'october': 'ኦክቶበር',
                'november': 'ኖቬምበር',
                'december': 'ዲሴምበር',

                // Days - Amharic
                'sunday': 'እሑድ',
                'monday': 'ሰኞ',
                'tuesday': 'ማክሰኞ',
                'wednesday': 'ረቡዕ',
                'thursday': 'ሐሙስ',
                'friday': 'ዓርብ',
                'saturday': 'ቅዳሜ',

                // Time - Amharic
                'today': 'ዛሬ',
                'yesterday': 'ትላንት',
                'tomorrow': 'ነገ',
                'thisWeek': 'ይህ ሳምንት',
                'lastWeek': 'ባለፈው ሳምንት',
                'nextWeek': 'የሚመጣው ሳምንት',
                'thisMonth': 'ይህ ወር',
                'lastMonth': 'ባለፈው ወር',
                'nextMonth': 'የሚመጣው ወር',
                'thisYear': 'ይህ ዓመት',
                'lastYear': 'ባለፈው ዓመት',
                'nextYear': 'የሚመጣው ዓመት'
            }
        };
    }

    // Get translation for a key
    t(key, params = {}) {
        let translation = this.translations[this.currentLanguage][key] ||
            this.translations['en'][key] ||
            key;

        // Replace parameters in translation
        Object.keys(params).forEach(param => {
            translation = translation.replace(`{${param}}`, params[param]);
        });

        return translation;
    }

    // Set language
    setLanguage(lang) {
        if (this.translations[lang]) {
            this.currentLanguage = lang;
            this.dir = 'ltr'; // Always use left-to-right
            localStorage.setItem('preferredLanguage', lang);

            // Update document direction
            document.documentElement.setAttribute('dir', this.dir);
            document.documentElement.setAttribute('lang', lang);

            this.applyToPage();
            return true;
        }
        return false;
    }

    // Toggle between English and Amharic
    toggleLanguage() {
        const newLang = this.currentLanguage === 'en' ? 'am' : 'en';
        this.setLanguage(newLang);
        return newLang;
    }

    // Apply translations to the entire page
    applyToPage() {
        // Update all elements with data-translate attribute
        document.querySelectorAll('[data-translate]').forEach(element => {
            this.translateElement(element);
        });

        // Update all elements with data-translate-placeholder attribute
        document.querySelectorAll('[data-translate-placeholder]').forEach(element => {
            const key = element.getAttribute('data-translate-placeholder');
            element.placeholder = this.t(key);
        });

        // Update all elements with data-translate-title attribute
        document.querySelectorAll('[data-translate-title]').forEach(element => {
            const key = element.getAttribute('data-translate-title');
            element.title = this.t(key);
        });

        // Update all elements with data-translate-alt attribute
        document.querySelectorAll('[data-translate-alt]').forEach(element => {
            const key = element.getAttribute('data-translate-alt');
            element.alt = this.t(key);
        });

        // Update language button if exists
        const langBtn = document.querySelector('.lang-btn');
        if (langBtn) {
            langBtn.textContent = this.currentLanguage.toUpperCase();
        }

        // Dispatch event for other components
        document.dispatchEvent(new CustomEvent('languageChanged', {
            detail: { language: this.currentLanguage }
        }));
    }

    // Translate a single element
    translateElement(element) {
        const key = element.getAttribute('data-translate');
        const translation = this.t(key);

        if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.tagName === 'SELECT') {
            // For form elements, check if it has a placeholder
            if (element.placeholder) {
                element.placeholder = translation;
            } else if (element.value === element.getAttribute('data-original-text')) {
                element.value = translation;
            }
        } else {
            element.textContent = translation;
        }
    }

    // Initialize language on page load
    init() {
        // Set document direction and language
        document.documentElement.setAttribute('dir', this.dir);
        document.documentElement.setAttribute('lang', this.currentLanguage);

        // Apply translations
        this.applyToPage();
    }

    // Get current language
    getCurrentLanguage() {
        return this.currentLanguage;
    }

    // Check if current language is Amharic
    isAmharic() {
        return this.currentLanguage === 'am';
    }

    // Format number according to language
    formatNumber(number) {
        if (this.currentLanguage === 'am') {
            // Amharic numerals
            const amharicNumerals = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
            return number.toString().split('').map(digit => amharicNumerals[digit] || digit).join('');
        }
        return number;
    }

    // Format date according to language
    formatDate(date) {
        const d = new Date(date);
        if (this.currentLanguage === 'am') {
            // Ethiopian date format
            const options = {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                weekday: 'long'
            };
            return d.toLocaleDateString('am-ET', options);
        }

        const options = {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'long'
        };
        return d.toLocaleDateString('en-US', options);
    }
}

// Create global instance
window.LanguageService = new LanguageService();