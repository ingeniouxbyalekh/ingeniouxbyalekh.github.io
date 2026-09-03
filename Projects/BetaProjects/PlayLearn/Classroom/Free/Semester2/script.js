document.addEventListener('DOMContentLoaded', () => {
    const scroller = document.getElementById('dateScroller');
    const loadingLine = document.getElementById('loadingLine');
    const fragmentContainer = document.getElementById('fragmentContainer');
    const profileToggle = document.getElementById('profileToggle');
    const branchMenu = document.getElementById('branchMenu');

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
            .catch(() => {
                // Execute fallback grid generator if file is missing
                const fallbackContent = getTimetableFallback(monthNum, dayNum);
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
    // Runs for every day of the year now (no semester start/end window) —
    // the weekday alone decides which classes show; classesArray is just
    // empty on weekends.
    function getTimetableFallback(month, day) {
        if (month === 0 || day === 0) return getEmptyStateHTML();

        const targetYear = new Date().getFullYear();
        const targetDateObj = new Date(targetYear, month - 1, day);
        const dayOfWeek = targetDateObj.toLocaleDateString('en-US', { weekday: 'long' });

        const semesterLabel = "Semester 2";
        const classesArray = getSem2Classes(dayOfWeek);

        // Return empty layout on weekends / days with no classes
        if (classesArray.length === 0) {
            return getEmptyStateHTML();
        }

        // Map array contents to structural fragment string components.
        // Notes are a paid feature on the Free plan (same as the
        // ClassNotes list below), so every tile stays locked and just
        // prompts to purchase instead of resolving/opening a link.
        let cardsHTML = '';
        classesArray.forEach((cls, index) => {
            // Automatically make the first class of the day highlighted
            const highlightClass = index === 0 ? 'highlight' : '';
            cardsHTML += `
                <div class="stat-card ${highlightClass} locked" onclick="showPurchasePrompt()" title="Purchase to unlock">
                    <div class="stat-text">
                        <span class="lab-time">${cls.time}</span>
                        <div class="lab-name">${cls.name} <i class="fas fa-lock lock-badge-sm"></i></div>
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
                .stat-card.locked { cursor: not-allowed; opacity: 0.6; }
                .stat-card.locked:hover { opacity: 0.8; }
                .lock-badge-sm { font-size: 10px; opacity: 0.8; margin-left: 2px; }
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

    // Short-code -> Firebase subject-code map (same codes as SUBJECTS in
    // subjects.js). Kept for parity with the paid classroom's schedule
    // logic even though Free-plan tiles stay locked and never resolve a
    // notes URL — this is what a code would map to once purchased.
    const SUBJECT_CODE_MAP = {
        CC: "CS6210",       // Cloud Computing
        COMPLAB: "CS6502",  // Computing Laboratory-II
        DM: "IP6002",       // Disaster Management
        HPC: "CS6102",      // High Performance Computing
        IOT: "EI6304",      // IoT and its Applications
        MLA: "CS6202",      // Machine Learning Applications
        OOAD: "CS6104",     // Object Oriented Analysis and Design
        PROJECT: "CS6602"   // Project (Specialization Related)
    };

    // Dataset Parser for Semester 2 Schedules
    function getSem2Classes(day) {
        const c = SUBJECT_CODE_MAP;

        switch(day) {
            case 'Monday':
                return [{ time: '11:00 AM', name: 'Disaster Mgmt', subjectCode: c.DM }];
            case 'Tuesday':
                return [
                    { time: '09:00 AM', name: 'IoT', subjectCode: c.IOT },
                    { time: '11:00 AM', name: 'OOAD', subjectCode: c.OOAD },
                    { time: '12:00 PM', name: 'MLA', subjectCode: c.MLA }
                ];
            case 'Wednesday':
                return [
                    { time: '09:00 AM', name: 'Project', subjectCode: c.PROJECT },
                    { time: '10:00 AM', name: 'Comp Lab-II', subjectCode: c.COMPLAB },
                    { time: '12:00 PM', name: 'HPC', subjectCode: c.HPC },
                    { time: '02:00 PM', name: 'Comp Lab-II', subjectCode: c.COMPLAB },
                    { time: '04:00 PM', name: 'CC', subjectCode: c.CC }
                ];
            case 'Thursday':
                return [
                    { time: '10:00 AM', name: 'OOAD', subjectCode: c.OOAD },
                    { time: '11:00 AM', name: 'HPC', subjectCode: c.HPC },
                    { time: '12:00 PM', name: 'IoT', subjectCode: c.IOT },
                    { time: '02:00 PM', name: 'Project', subjectCode: c.PROJECT },
                    { time: '03:00 PM', name: 'MLA', subjectCode: c.MLA },
                    { time: '04:00 PM', name: 'CC', subjectCode: c.CC }
                ];
            case 'Friday':
                return [
                    { time: '09:00 AM', name: 'OOAD', subjectCode: c.OOAD },
                    { time: '10:00 AM', name: 'CC', subjectCode: c.CC },
                    { time: '11:00 AM', name: 'HPC', subjectCode: c.HPC },
                    { time: '12:00 PM', name: 'MLA', subjectCode: c.MLA }
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
