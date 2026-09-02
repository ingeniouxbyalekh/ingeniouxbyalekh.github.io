document.addEventListener('DOMContentLoaded', () => {
    const scroller = document.getElementById('dateScroller');
    const loadingLine = document.getElementById('loadingLine');
    const fragmentContainer = document.getElementById('fragmentContainer');
    const profileToggle = document.getElementById('profileToggle');
    const branchMenu = document.getElementById('branchMenu');

    // Fetched once (via subjects.js's loadMaterialLinks) and reused for
    // every date's timetable card, so clicking around the scroller
    // doesn't re-hit Firebase on each click.
    let materialLinksCache = null;
    const getMaterialLinks = async () => {
        if (!materialLinksCache) {
            materialLinksCache = await loadMaterialLinks();
        }
        return materialLinksCache;
    };

    // --- 1. GENERATE 365 DAYS ---
    const generateCalendar = () => {
        const now = new Date();
        
        // Get Today's Date in IST using 2-digit month (MM) and day (DD)
        const todayIST = new Intl.DateTimeFormat('en-IN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            timeZone: 'Asia/Kolkata'
        }).format(now);

        const year = now.getFullYear();
        const start = new Date(year, 0, 1);
        const end = new Date(year, 11, 31);
        
        let html = '';
        
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dayNum = d.getDate().toString().padStart(2, '0');
            const monthNum = (d.getMonth() + 1).toString().padStart(2, '0'); // MM (01-12)
            const monthShort = d.toLocaleString('en-IN', { month: 'short' }).toUpperCase();
            
            // Format current loop date to compare with todayIST (DD/MM/YYYY)
            const currentLoopDate = new Intl.DateTimeFormat('en-IN', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            }).format(d);

            const isActive = currentLoopDate === todayIST ? 'active' : '';
            const idTag = currentLoopDate === todayIST ? 'id="today"' : '';

            // Fragment naming convention
            const fileName = `dailyactivity/${monthNum}-${dayNum}.html`;

            html += `
                <div class="date-item ${isActive}" ${idTag} data-fragment="${fileName}">
                    <span class="month">${monthShort}</span>
                    <div class="circle">${dayNum}</div>
                </div>
            `;
        }
        scroller.innerHTML = html;

        // Auto-scroll to today (Centered)
        setTimeout(() => {
            const todayEl = document.getElementById('today');
            if (todayEl) {
                todayEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            }
        }, 300);
    };

    // --- 2. BRANCH DROPDOWN LOGIC ---
    if (profileToggle && branchMenu) {
        profileToggle.addEventListener('click', (e) => {
            // Only intercept clicks on the badge itself (to open/close the
            // dropdown). Clicks on items INSIDE the dropdown (e.g. "Log
            // out", "My Profile") must keep bubbling up to document, since
            // auth.js's logout handler is a document-level delegated
            // listener — stopping propagation here was swallowing those
            // clicks before they ever reached it.
            if (branchMenu.contains(e.target)) return;
            e.stopPropagation();
            branchMenu.classList.toggle('show');
        });

        document.addEventListener('click', () => {
            branchMenu.classList.remove('show');
        });
    }

    // --- 3. FRAGMENT LOADING LOGIC ---
    const loadFragment = (fileName) => {
        if (!loadingLine) return;

        loadingLine.style.opacity = '1';
        loadingLine.style.width = '30%';

        // Extract MM-DD from path names securely
        let monthNum = 0, dayNum = 0;
        if (fileName) {
            const dateMatch = fileName.match(/(\d{2})-(\d{2})/);
            if (dateMatch) {
                monthNum = parseInt(dateMatch[1], 10);
                dayNum = parseInt(dateMatch[2], 10);
            }
        }

        fetch(fileName)
            .then(response => {
                if (!response.ok) throw new Error('Not Found');
                return response.text();
            })
            .then(html => {
                renderContent(html);
            })
            .catch(async () => {
                // Execute fallback grid generator if file is missing
                const fallbackContent = await getTimetableFallback(monthNum, dayNum);
                renderContent(fallbackContent);
            });
    };

    // --- 3.1 RENDER TRANSITION CONTENT ---
    function renderContent(content) {
        if (!loadingLine || !fragmentContainer) return;
        loadingLine.style.width = '100%';
        setTimeout(() => {
            fragmentContainer.innerHTML = content;
            loadingLine.style.opacity = '0';
            setTimeout(() => { loadingLine.style.width = '0%'; }, 300);
            
            // Re-bind click analytics listeners for freshly injected dynamic cards
            bindDownloadListeners();
        }, 200);
    }

    // --- 3.2 DYNAMIC GRID FALLBACK GENERATOR ---
    // Same weekly Semester 1 timetable applies to every date in the
    // scroller (Jan 1 - Dec 31) — no date-range gating, only weekday
    // (weekends stay empty since getSem1Classes returns [] for them).
    async function getTimetableFallback(month, day) {
        if (month === 0 || day === 0) return getEmptyStateHTML();

        const targetYear = new Date().getFullYear();
        const targetDateObj = new Date(targetYear, month - 1, day);
        const dayOfWeek = targetDateObj.toLocaleDateString('en-US', { weekday: 'long' });

        const semesterLabel = "Semester 1";
        const classesArray = getSem1Classes(dayOfWeek);

        // Return empty layout on weekends / days with no classes
        if (classesArray.length === 0) {
            return getEmptyStateHTML();
        }

        // Resolve each class's notes link from Firebase's /links table
        // (same "<code>-Notes" keying the ClassNotes section on
        // index.html already uses).
        const linksMap = await getMaterialLinks();

        // Map array contents to structural fragment string components
        let cardsHTML = '';
        classesArray.forEach((cls, index) => {
            // Automatically make the first class of the day highlighted
            const highlightClass = index === 0 ? 'highlight' : '';
            const entry = linksMap[`${cls.code}-Notes`];
            const url = entry && entry.url;

            const tileInner = `
                        <span class="lab-time">${cls.time}</span>
                        <div class="lab-name">${cls.name}</div>`;

            cardsHTML += url
                ? `
                <a class="stat-card ${highlightClass}" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">
                    <div class="stat-text">${tileInner}
                    </div>
                </a>`
                : `
                <div class="stat-card ${highlightClass}" style="opacity:.7;cursor:default;">
                    <div class="stat-text">${tileInner}
                    </div>
                </div>`;
        });

        return `
            <style>
                .stats-row {
                    display: grid;
                    gap: 15px;
                    width: 100%;
                    padding: 10px 10px 0 10px;
                    box-sizing: border-box;
                }
                @media (max-width: 767px) { .stats-row { grid-template-columns: repeat(2, 1fr); } }
                @media (min-width: 768px) { .stats-row { grid-template-columns: repeat(3, 1fr); } }
                .stat-card {
                    background: #ffffff;
                    padding: 18px;
                    border-radius: 12px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
                    border: 1px solid #eee;
                    display: flex;
                    flex-direction: column;
                    justify-content: space-between;
                    min-height: 110px;
                    transition: transform 0.2s ease;
                }
                .stat-card:hover { transform: translateY(-2px); }
                .stat-card.highlight { background-color: #eef6ff; border-color: #4a90e2; }
                .lab-time { font-size: 11px; color: #4a90e2; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; display: block; }
                .lab-name { font-size: 16px; font-weight: 600; color: #333; margin-top: 6px; }
            </style>
            
            <h3 style="font-size: 14px; color: #666; margin: 10px 0 2px 12px; font-weight: 600;">
                ${semesterLabel} &bull; ${dayOfWeek} Schedule
            </h3>
            
            <p style="font-size: 11px; color: #999; margin: 0 0 10px 12px; font-style: italic;">
                * This is according to the timetable, not actual class shedule.
            </p>
            
            <div class="stats-row">
                ${cardsHTML}
            </div>
        `;
    }

    function getEmptyStateHTML() {
        return `
            <div class="stats-row">
                <div class="stat-card">No Notes Yet</div>
                <div class="stat-card highlight">No Classes</div>
            </div>`;
    }

    // Semester 1 weekly timetable. `code` matches SUBJECTS[].code in
    // subjects.js and is used to resolve that class's notes link from
    // Firebase ("<code>-Notes" under /links) — no hardcoded URLs here.
    function getSem1Classes(day) {
        switch(day) {
            case 'Monday':
                return [
                    { time: '12:00 PM', name: 'ADSA', code: 'CS6101' },
                    { time: '02:00 PM', name: 'ADSA Lab', code: 'CS6501' },
                ];
            case 'Tuesday':
                return [
                    { time: '09:00 AM', name: 'RM & IPR', code: 'MS6403' },
                    { time: '12:00 PM', name: 'ADSA', code: 'CS6101' },
                    { time: '02:00 PM', name: 'MME (2)', code: 'BH6401' }
                ];
            case 'Wednesday':
                return [
                    { time: '10:00 AM', name: 'RM & IPR', code: 'MS6403' },
                    { time: '11:00 AM', name: 'Comp Lab-I', code: 'CS6503' },
                    { time: '02:00 PM', name: 'WSN', code: 'CS6103' },
                    { time: '03:00 PM', name: 'DM', code: 'CS6205' }
                ];
            case 'Thursday':
                return [
                    { time: '09:00 AM', name: 'MME', code: 'BH6401' },
                    { time: '10:00 AM', name: 'ADSA', code: 'CS6101' },
                    { time: '11:00 AM', name: 'DM', code: 'CS6205' },
                    { time: '12:00 PM', name: 'WSN', code: 'CS6103' },
                    { time: '02:00 PM', name: 'Comp Lab-I', code: 'CS6503' }
                ];
            case 'Friday':
                return [
                    { time: '12:00 PM', name: 'WSN', code: 'CS6103' },
                    { time: '02:00 PM', name: 'DM', code: 'CS6205' },
                    { time: '03:00 PM', name: 'Comp Lab-I', code: 'CS6503' }
                ];
            default: return [];
        }
    }

    // Re-bind hook kept as a no-op for compatibility with renderContent()'s
    // call site; schedule cards no longer expose a download action.
    function bindDownloadListeners() {}

    // --- 4. EVENT DELEGATION FOR SCROLLER ---
    scroller.addEventListener('click', (e) => {
        const item = e.target.closest('.date-item');
        if (!item) return;

        document.querySelectorAll('.date-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        loadFragment(item.getAttribute('data-fragment'));
    });

    // --- 5. INITIALIZE ---
    generateCalendar();
    
    const todayActive = document.querySelector('.date-item.active');
    if (todayActive) {
        loadFragment(todayActive.getAttribute('data-fragment'));
    }

    // --- 6. DESKTOP SCROLL SUPPORT ---
    scroller.addEventListener('wheel', (e) => {
        if (e.deltaY !== 0) {
            e.preventDefault();
            scroller.scrollLeft += e.deltaY * 2;
        }
    });
});

// --- 7. BOTTOM NAV ACADEMICS UTILITY ---
const academicsTrigger = document.getElementById('academicsTrigger');
const utilityMenu = document.getElementById('utilityMenu');

if (academicsTrigger && utilityMenu) {
    academicsTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        utilityMenu.classList.toggle('show');
    });

    document.addEventListener('click', () => {
        utilityMenu.classList.remove('show');
    });
}
