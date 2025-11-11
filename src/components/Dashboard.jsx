import React, { useState, useEffect, useRef } from "react";
import RoomCard from "./RoomCard";
import * as pdfjsLib from "pdfjs-dist";
import { db } from "../config/firebase";
import { collection, doc, getDoc, setDoc, onSnapshot, writeBatch } from "firebase/firestore";

// Configure PDF.js worker for Vite
if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  // Use local worker file from public folder (more reliable than CDN)
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
}

// Login Modal Component
const LoginModal = ({ onLogin }) => {
  const [nickname, setNickname] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (nickname.trim()) {
      onLogin(nickname);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
        placeholder="กรอกชื่อเล่น"
        className="w-full border rounded-lg p-3 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-[#15803D]"
        autoFocus
      />
      <button
        type="submit"
        className="w-full bg-[#15803D] text-white py-2 rounded-lg hover:bg-[#166534] transition-colors"
      >
        เข้าสู่ระบบ
      </button>
    </form>
  );
};

const thaiDays = [
  "วันอาทิตย์", "วันจันทร์", "วันอังคาร", "วันพุธ", "วันพฤหัสบดี", "วันศุกร์", "วันเสาร์"
];

const thaiMonths = [
  "มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน",
  "กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"
];

const Dashboard = () => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [departureRooms, setDepartureRooms] = useState([]); // Track rooms from departure report
  const [inhouseRooms, setInhouseRooms] = useState([]); // Track rooms from in-house report
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [nickname, setNickname] = useState("");
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showClearConfirmModal, setShowClearConfirmModal] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [teamNotes, setTeamNotes] = useState("");
  
  // Update time every minute
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute
    
    return () => clearInterval(timer);
  }, []);

  // Close user menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showUserMenu && !event.target.closest('.user-menu-container')) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showUserMenu]);

  // Check if user is logged in from localStorage on mount and verify logout status
  useEffect(() => {
    const checkLoginStatus = () => {
      const storedNickname = localStorage.getItem('crystal_nickname');
      const loginTimestamp = localStorage.getItem('crystal_login_timestamp');
      const logoutTimestamp = localStorage.getItem('crystal_logout_timestamp');
      
      // Check if user was logged out on another device
      if (storedNickname && loginTimestamp && logoutTimestamp) {
        const loginTime = parseInt(loginTimestamp);
        const logoutTime = parseInt(logoutTimestamp);
        
        // If logout happened after login, user is logged out
        if (logoutTime > loginTime) {
          localStorage.removeItem('crystal_nickname');
          localStorage.removeItem('crystal_login_timestamp');
          setIsLoggedIn(false);
          setNickname("");
          return;
        }
      }
      
      if (storedNickname) {
        setNickname(storedNickname);
        setIsLoggedIn(true);
      }
      // Don't automatically show login modal - user clicks button instead
    };

    checkLoginStatus();
    
    // Check for logout events periodically (every 5 seconds)
    const logoutCheckInterval = setInterval(checkLoginStatus, 5000);
    
    return () => clearInterval(logoutCheckInterval);
  }, []);

  // Load team notes from localStorage on mount
  useEffect(() => {
    const storedNotes = localStorage.getItem('crystal_team_notes');
    if (storedNotes) {
      setTeamNotes(storedNotes);
    }
  }, []);

  // Save team notes to localStorage whenever they change
  useEffect(() => {
    if (teamNotes !== undefined) {
      localStorage.setItem('crystal_team_notes', teamNotes);
    }
  }, [teamNotes]);

  const today = currentTime;
  const buddhistYear = today.getFullYear() + 543; // Convert CE to พ.ศ. (Buddhist Era)
  const dayOfWeek = thaiDays[today.getDay()]; // 0 = Sunday, 1 = Monday, etc.
  const dateString = `${dayOfWeek} ${today.getDate()} ${thaiMonths[today.getMonth()]} ${buddhistYear}`;
  // Date format for remarks: day month (without year and day of week)
  const remarkDateString = `${today.getDate()} ${thaiMonths[today.getMonth()]}`;
  
  // Format time as hh:mm น. (24-hour format)
  const formatTime = (date) => {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes} น.`;
  };
  const timeString = formatTime(currentTime);

  // Ref to track if we're updating from Firestore (to prevent infinite loops)
  const isUpdatingFromFirestore = useRef(false);
  const isInitialLoad = useRef(true);
  const isUploadingPDF = useRef(false);
  const inhouseFileInputRef = useRef(null); // Ref for inhouse file input
  const departureFileInputRef = useRef(null); // Ref for departure file input

  // Default rooms data (fallback if Firestore is empty)
  const defaultRooms = [
    // Floor 6
    { number: "601", type: "S", floor: 6, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "602", type: "S", floor: 6, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "603", type: "S", floor: 6, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "604", type: "S", floor: 6, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "605", type: "D6", floor: 6, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "606", type: "S", floor: 6, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "607", type: "S", floor: 6, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "608", type: "S", floor: 6, status: "long_stay", maid: "", remark: "", cleanedToday: false },
    { number: "609", type: "S", floor: 6, status: "long_stay", maid: "", remark: "", cleanedToday: false },
    // Floor 5
    { number: "501", type: "D6", floor: 5, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "502", type: "D2", floor: 5, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "503", type: "S", floor: 5, status: "long_stay", maid: "", remark: "", cleanedToday: false },
    { number: "505", type: "S", floor: 5, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "507", type: "D2", floor: 5, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "508", type: "D6", floor: 5, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "509", type: "D6", floor: 5, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "510", type: "D2", floor: 5, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "511", type: "D6", floor: 5, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "512", type: "D2", floor: 5, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "514", type: "D6", floor: 5, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "515", type: "D2", floor: 5, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "516", type: "D6", floor: 5, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "518", type: "S", floor: 5, status: "vacant", maid: "", remark: "", cleanedToday: false },
    // Floor 4
    { number: "401", type: "D6", floor: 4, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "402", type: "D2", floor: 4, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "403", type: "D2", floor: 4, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "404", type: "D6", floor: 4, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "405", type: "D2", floor: 4, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "406", type: "D6", floor: 4, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "407", type: "D6", floor: 4, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "408", type: "D2", floor: 4, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "409", type: "D6", floor: 4, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "410", type: "D2", floor: 4, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "411", type: "D6", floor: 4, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "412", type: "D6", floor: 4, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "414", type: "D2", floor: 4, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "415", type: "D2", floor: 4, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "416", type: "D6", floor: 4, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "417", type: "D6", floor: 4, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "418", type: "D2", floor: 4, status: "vacant", maid: "", remark: "", cleanedToday: false },
    // Floor 3
    { number: "301", type: "D5", floor: 3, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "302", type: "D5", floor: 3, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "303", type: "D5", floor: 3, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "304", type: "D5", floor: 3, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "305", type: "D5", floor: 3, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "306", type: "D5", floor: 3, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "307", type: "D5", floor: 3, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "308", type: "D5", floor: 3, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "309", type: "D6", floor: 3, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "310", type: "D5", floor: 3, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "311", type: "D5", floor: 3, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "312", type: "D6", floor: 3, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "314", type: "D5", floor: 3, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "315", type: "D2", floor: 3, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "316", type: "D6", floor: 3, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "317", type: "D6", floor: 3, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "318", type: "D2", floor: 3, status: "vacant", maid: "", remark: "", cleanedToday: false },
    // Floor 2
    { number: "201", type: "D5", floor: 2, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "202", type: "D5", floor: 2, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "203", type: "D5", floor: 2, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "204", type: "D5", floor: 2, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "205", type: "D5", floor: 2, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "206", type: "D5", floor: 2, status: "long_stay", maid: "", remark: "", cleanedToday: false },
    { number: "207", type: "D5", floor: 2, status: "long_stay", maid: "", remark: "", cleanedToday: false },
    { number: "208", type: "D5", floor: 2, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "209", type: "D6", floor: 2, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "210", type: "D5", floor: 2, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "211", type: "D5", floor: 2, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "212", type: "D5", floor: 2, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "214", type: "D2", floor: 2, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "215", type: "D2", floor: 2, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "216", type: "D5", floor: 2, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "217", type: "D5", floor: 2, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "218", type: "D5", floor: 2, status: "vacant", maid: "", remark: "", cleanedToday: false },
    // Floor 1
    { number: "101", type: "D5", floor: 1, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "102", type: "D5", floor: 1, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "103", type: "D5", floor: 1, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "104", type: "D5", floor: 1, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "105", type: "D5", floor: 1, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "106", type: "D5", floor: 1, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "107", type: "D5", floor: 1, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "108", type: "D5", floor: 1, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "109", type: "D5", floor: 1, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "110", type: "D5", floor: 1, status: "vacant", maid: "", remark: "", cleanedToday: false },
    { number: "111", type: "D5", floor: 1, status: "vacant", maid: "", remark: "", cleanedToday: false },
  ];

  // Helper function to migrate moved_out to checked_out (consolidate statuses)
  const migrateMovedOutToCheckedOut = (roomsArray) => {
    return roomsArray.map(r => 
      r.status === "moved_out" ? { ...r, status: "checked_out" } : r
    );
  };

  // Rooms state - will be synced with Firestore
  const [rooms, setRooms] = useState(migrateMovedOutToCheckedOut(defaultRooms));

  // Initialize Firestore sync
  useEffect(() => {
    const roomsCollection = collection(db, "rooms");
    const roomsDoc = doc(roomsCollection, "allRooms");

    // Set up real-time listener
    const unsubscribe = onSnapshot(roomsDoc, (snapshot) => {
      // Don't update from Firestore if we're currently uploading a PDF
      if (isUploadingPDF.current) {
        console.log("Skipping Firestore update: PDF upload in progress");
        return;
      }
      
      if (snapshot.exists()) {
        const data = snapshot.data();
        
        // Skip if this is the initial load and we already have local data
        if (isInitialLoad.current && rooms.length > 0) {
          // Check if local data is more recent than Firestore
          const localHasData = rooms.some(r => r.status !== "vacant" && r.status !== "long_stay");
          if (localHasData) {
            console.log("Skipping Firestore update on initial load: Local data exists");
            isInitialLoad.current = false;
            return;
          }
        }
        
        if (!isUpdatingFromFirestore.current && data.rooms && Array.isArray(data.rooms)) {
          // Always sync from Firestore - no protection restrictions
          // Room status persists until manually changed, FO presses delete, or FO uploads new PDFs
          isUpdatingFromFirestore.current = true;
          
          // Merge Firestore data - migrate moved_out to checked_out for consistency
          const mergedRooms = data.rooms.map(firestoreRoom => {
            // Migrate moved_out to checked_out for consistency (both mean "ออกแล้ว")
            if (firestoreRoom.status === "moved_out") {
              return { ...firestoreRoom, status: "checked_out" };
            }
            return firestoreRoom;
          });
          
          setRooms(mergedRooms);
          // Also sync departure/inhouse rooms if they exist
          if (data.departureRooms) setDepartureRooms(data.departureRooms);
          if (data.inhouseRooms) setInhouseRooms(data.inhouseRooms);
          isUpdatingFromFirestore.current = false;
          isInitialLoad.current = false;
          console.log(`✅ Firestore update applied: Synced from Firestore`);
        }
      } else {
        // Document doesn't exist, initialize with default rooms
        if (isInitialLoad.current) {
          setDoc(roomsDoc, {
            rooms: defaultRooms,
            departureRooms: [],
            inhouseRooms: [],
            lastUpdated: new Date().toISOString()
          }).catch(error => {
            console.error("Error initializing Firestore:", error);
          });
          isInitialLoad.current = false;
        }
      }
    }, (error) => {
      console.error("Error listening to Firestore:", error);
      // Fallback to default rooms on error
      if (isInitialLoad.current) {
        setRooms(defaultRooms);
        isInitialLoad.current = false;
      }
    });

    return () => unsubscribe();
  }, []);

  // Sync rooms to Firestore when they change (but not when updating from Firestore)
  useEffect(() => {
    if (isUpdatingFromFirestore.current || isInitialLoad.current) {
      return;
    }


    const roomsCollection = collection(db, "rooms");
    const roomsDoc = doc(roomsCollection, "allRooms");

    // Debounce Firestore writes to avoid too many updates
    // Migrate moved_out to checked_out before writing to Firestore
    const migratedRooms = migrateMovedOutToCheckedOut(rooms);
    const timeoutId = setTimeout(() => {
      setDoc(roomsDoc, {
        rooms: migratedRooms,
        departureRooms: departureRooms,
        inhouseRooms: inhouseRooms,
        lastUpdated: new Date().toISOString()
      }, { merge: true }).catch(error => {
        console.error("Error syncing to Firestore:", error);
      });
    }, 500); // 500ms debounce

    return () => clearTimeout(timeoutId);
  }, [rooms, departureRooms, inhouseRooms]);

  const handleUpload = async (type, file) => {
    if (!file) {
      console.log("No file selected");
      return;
    }
    
    // Require login for PDF uploads
    if (!isLoggedIn) {
      setShowLoginModal(true);
      return;
    }
    
    // Only allow "FO" to upload PDFs
    if (nickname !== "FO") {
      alert("คุณไม่สามารถกดปุ่มนี้");
      return;
    }
    
    // Set flag to prevent Firestore listener from overwriting during upload
    isUploadingPDF.current = true;
    
    try {
      console.log(`Starting PDF upload: ${type}`);
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      let allText = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(" ");
        allText += " " + pageText;
      }

      // Extract 3-digit room numbers from text (e.g., 101, 205, 603)
      // Filter to only valid room numbers (101-699, first digit 1-6)
      const roomMatches = allText.match(/\b\d{3}\b/g) || [];
      const validRoomNumbers = roomMatches
        .filter(num => {
          const firstDigit = parseInt(num[0]);
          return firstDigit >= 1 && firstDigit <= 6; // Valid floors are 1-6
        });
      const uniqueRooms = [...new Set(validRoomNumbers)];

      console.log("All detected room numbers:", uniqueRooms);

      if (uniqueRooms.length === 0) {
        alert("ไม่พบหมายเลขห้องในไฟล์ PDF!");
        isUploadingPDF.current = false;
        return;
      }

      // Track rooms from each report type - filter to only valid room numbers that exist in rooms array
      const validExistingRooms = uniqueRooms.filter(roomNum => {
        return rooms.some(r => String(r.number) === String(roomNum));
      });

      console.log("Valid existing rooms:", validExistingRooms);

      if (validExistingRooms.length === 0) {
        alert(`พบหมายเลขห้อง ${uniqueRooms.length} ห้องใน PDF แต่ไม่มีห้องเหล่านี้ในระบบ`);
        isUploadingPDF.current = false;
        return;
      }

      // Update only rooms found in PDF - set status based on report type
      // In-House PDF = blue (stay_clean)
      // Expected Departure PDF = yellow (will_depart_today)
      const updatedRooms = rooms.map(r => {
        // Convert to string for comparison
        const roomNumStr = String(r.number);
        const isInPDF = validExistingRooms.some(pdfRoom => String(pdfRoom) === roomNumStr);
        
        // Only update rooms found in the PDF
        if (isInPDF) {
          if (type === "inhouse") {
            // In-House PDF: set to blue (stay_clean)
            console.log(`Updating room ${r.number} to stay_clean (blue)`);
            return { ...r, status: "stay_clean", cleanedToday: false };
          }
          if (type === "departure") {
            // Expected Departure PDF: set to yellow (will_depart_today)
            console.log(`Updating room ${r.number} to will_depart_today (yellow)`);
            return { ...r, status: "will_depart_today", cleanedToday: false };
          }
        }
        // Return room unchanged if not in PDF
        return r;
      });
      
      // Update tracking arrays
      if (type === "departure") {
        setDepartureRooms([...new Set(validExistingRooms)]);
      } else if (type === "inhouse") {
        setInhouseRooms([...new Set(validExistingRooms)]);
      }

      console.log("Updated rooms count:", updatedRooms.filter(r => {
        const roomNumStr = String(r.number);
        const isInPDF = validExistingRooms.some(pdfRoom => String(pdfRoom) === roomNumStr);
        return isInPDF && (type === "departure" ? r.status === "will_depart_today" : r.status === "stay_clean");
      }).length);

      // Migrate moved_out to checked_out before updating local state
      const migratedUpdatedRooms = migrateMovedOutToCheckedOut(updatedRooms);
      
      // Count how many rooms actually changed status
      const changedRooms = migratedUpdatedRooms.filter((r, idx) => {
        const originalRoom = rooms.find(or => String(or.number) === String(r.number));
        return originalRoom && originalRoom.status !== r.status;
      });
      
      console.log(`📊 PDF Upload Summary: ${changedRooms.length} rooms changed status`);
      console.log(`   Changed rooms:`, changedRooms.map(r => `${r.number}: ${rooms.find(or => String(or.number) === String(r.number))?.status} → ${r.status}`));
      
      setRooms(migratedUpdatedRooms);

      // Update tracking arrays (already done above)
      const updatedDepartureRooms = type === "departure" 
        ? [...new Set(validExistingRooms)]
        : departureRooms;
      
      const updatedInhouseRooms = type === "inhouse" 
        ? [...new Set(validExistingRooms)]
        : inhouseRooms;

      // Explicitly write to Firestore to ensure sync across all devices
      try {
        const roomsCollection = collection(db, "rooms");
        const roomsDoc = doc(roomsCollection, "allRooms");
        
        // Migrate moved_out to checked_out before writing to Firestore
        const migratedRoomsForFirestore = migrateMovedOutToCheckedOut(updatedRooms);
        await setDoc(roomsDoc, {
          rooms: migratedRoomsForFirestore,
          departureRooms: updatedDepartureRooms,
          inhouseRooms: updatedInhouseRooms,
          lastUpdated: new Date().toISOString()
        }, { merge: true });
        
        console.log(`✅ PDF upload synced to Firestore - ${validExistingRooms.length} rooms updated`);
      } catch (error) {
        console.error("Error syncing PDF upload to Firestore:", error);
      }

      // Show success toast with count
      const statusText = type === "departure" ? "จะออกวันนี้" : "พักต่อ";
      alert(`${validExistingRooms.length} ห้องถูกอัปเดตเป็นสถานะ ${statusText}`);
      
      // Reset file input so the same file can be uploaded again
      if (type === "inhouse" && inhouseFileInputRef.current) {
        inhouseFileInputRef.current.value = "";
      } else if (type === "departure" && departureFileInputRef.current) {
        departureFileInputRef.current.value = "";
      }
      
      // Wait longer for Firestore to sync and prevent listener from overwriting
      // The explicit write is done, but keep flag for safety
      setTimeout(() => {
        isUploadingPDF.current = false;
        console.log("PDF upload flag reset (15s timeout)");
      }, 15000); // 15 seconds to ensure Firestore sync completes before re-enabling listener
    } catch (error) {
      console.error("Error processing PDF:", error);
      alert(`เกิดข้อผิดพลาดในการประมวลผล PDF: ${error.message}`);
      isUploadingPDF.current = false;
    }
  };

  const floors = [6,5,4,3,2,1].map(f =>
    rooms.filter(r => r.floor === f)
  );

  // Calculate maid scores dynamically
  // Deluxe = 1pt, Suite = 2pts, only count green (cleaned) rooms cleaned today
  // Track by nickname (cleanedBy) when status is changed to "cleaned"
  const calculateMaidScores = () => {
    const scores = {};
    rooms.forEach(room => {
      if (room.status === "cleaned" && room.cleanedToday && room.cleanedBy) {
        const isSuite = room.type.toUpperCase().startsWith("S");
        const points = isSuite ? 2 : 1;
        const nickname = room.cleanedBy;
        scores[nickname] = (scores[nickname] || 0) + points;
      }
    });
    return scores;
  };

  const maidScores = calculateMaidScores();
  const maidEntries = Object.entries(maidScores).sort((a, b) => b[1] - a[1]);

  const handleLogin = (nicknameInput) => {
    if (nicknameInput && nicknameInput.trim()) {
      const trimmedNickname = nicknameInput.trim();
      const loginTimestamp = new Date().getTime();
      setNickname(trimmedNickname);
      setIsLoggedIn(true);
      setShowLoginModal(false);
      localStorage.setItem('crystal_nickname', trimmedNickname);
      localStorage.setItem('crystal_login_timestamp', loginTimestamp.toString());
    }
  };

  const handleLogout = () => {
    const logoutTimestamp = new Date().getTime();
    setIsLoggedIn(false);
    setNickname("");
    setShowUserMenu(false); // Close menu when logging out
    // Store logout timestamp to sync across devices
    localStorage.setItem('crystal_logout_timestamp', logoutTimestamp.toString());
    localStorage.removeItem('crystal_nickname');
    localStorage.removeItem('crystal_login_timestamp');
    setShowLoginModal(true);
  };

  const handleClearDataClick = () => {
    // Require login
    if (!isLoggedIn) {
      setShowLoginModal(true);
      return;
    }
    // Only allow "FO" to clear data
    if (nickname !== "FO") {
      alert("คุณไม่สามารถกดปุ่มนี้");
      return;
    }
    // Show confirmation modal
    setShowClearConfirmModal(true);
  };

  const handleClearDataConfirm = async () => {
    // Double-check: Only allow "FO" to clear data
    if (nickname !== "FO") {
      alert("คุณไม่สามารถกดปุ่มนี้");
      setShowClearConfirmModal(false);
      return;
    }
    
    
    // Reset only green, red, yellow, or blue rooms to white (vacant)
    // Keep gray (closed) and dark gray (long stay) unchanged
    // Clear maid nickname from reset rooms
    // Do not delete remark dot or remark text
    const clearedRooms = rooms.map(r => {
      // Keep gray rooms (closed = gray-500, long_stay = gray-200) unchanged
      if (r.status === "closed" || r.status === "long_stay") {
        return r;
      }
      
      // Reset green, red, yellow, or blue to white (vacant)
      if (r.status === "cleaned" || r.status === "checked_out" || 
          r.status === "will_depart_today" || r.status === "stay_clean") {
        return {
          ...r,
          status: "vacant",
          maid: "", // Clear maid nickname
          lastEditor: "",
          selectedBy: "",
          cleanedBy: "",
          cleanedToday: false,
          remark: r.remark || "" // Preserve remark - do not delete
        };
      }
      
      // Already white or other status - no change needed
      return r;
    });

    // Update local state
    setRooms(clearedRooms);
    setDepartureRooms([]);
    setInhouseRooms([]);
    
    // Clear localStorage reports
    try {
      localStorage.removeItem('crystal_reports');
      console.log("Cleared localStorage reports");
    } catch (error) {
      console.error("Error clearing localStorage reports:", error);
    }
    
    // Explicitly write to Firestore to ensure sync across all devices
    try {
      const roomsCollection = collection(db, "rooms");
      const roomsDoc = doc(roomsCollection, "allRooms");
      
      const clearDataPayload = {
        rooms: clearedRooms,
        departureRooms: [],
        inhouseRooms: [],
        lastUpdated: new Date().toISOString()
      };
      
      await setDoc(roomsDoc, clearDataPayload, { merge: true });
      
      console.log("✅ Clear data synced to Firestore - all devices will see cleared data");
      console.log(`Cleared ${clearedRooms.filter(r => r.status === "vacant").length} rooms to vacant`);
    } catch (error) {
      console.error("Error syncing clear data to Firestore:", error);
      alert("เกิดข้อผิดพลาดในการลบข้อมูล: " + error.message);
    }
    
    // Close confirmation modal
    setShowClearConfirmModal(false);
  };

  return (
    <div className="min-h-screen bg-[#F6F8FA] font-['Noto_Sans_Thai'] p-4">
        {/* Login Modal */}
        {showLoginModal && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-6 w-96 shadow-lg">
              <h2 className="font-semibold text-xl mb-4 text-center text-[#15803D]">
                เข้าสู่ระบบ
              </h2>
              <p className="text-sm text-[#63738A] mb-4 text-center">
                กรุณากรอกชื่อเล่นเพื่อแก้ไขข้อมูลห้อง
              </p>
              <LoginModal onLogin={handleLogin} />
            </div>
          </div>
        )}

      {/* Clear Data Confirmation Modal */}
      {showClearConfirmModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-96 shadow-lg">
            <h2 className="font-semibold text-xl mb-4 text-center text-red-600">
              ยืนยันการลบข้อมูล
            </h2>
            <p className="text-sm text-[#63738A] mb-6 text-center">
              คุณแน่ใจหรือไม่ว่าต้องการลบข้อมูลทั้งหมด?<br />
              การกระทำนี้จะรีเซ็ตสถานะห้องทั้งหมด (ยกเว้นห้องรายเดือน) เป็น "ว่าง"<br />
              และลบข้อมูลการส่งห้องของแม่บ้าน
            </p>
            <p className="text-xs text-[#63738A] mb-6 text-center italic">
              หมายเหตุ: ข้อมูลในกล่องหมายเหตุจะไม่ถูกลบ
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowClearConfirmModal(false)}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleClearDataConfirm}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                ยืนยันลบข้อมูล
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="text-center mb-6 relative">
        {/* Login/User Pill Button - Top Right */}
        <div className="absolute top-0 right-0 user-menu-container">
          {isLoggedIn ? (
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="px-4 py-2 bg-[#15803D] text-white rounded-full shadow-md hover:bg-[#166534] transition-colors text-sm font-medium flex items-center gap-2"
              >
                <span>👤</span>
                <span>{nickname}</span>
                <span className="text-xs">▼</span>
              </button>
              
              {/* Dropdown Menu */}
              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                  <div className="py-1">
                    <div className="px-4 py-2 text-sm text-gray-700 border-b border-gray-100">
                      <div className="font-medium">{nickname}</div>
                      <div className="text-xs text-gray-500">ผู้ใช้ที่เข้าสู่ระบบ</div>
                    </div>
                    <button
                      onClick={handleLogout}
                      className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2"
                    >
                      <span>🚪</span>
                      <span>ออกจากระบบ</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => setShowLoginModal(true)}
              className="px-4 py-2 bg-[#15803D] text-white rounded-full shadow-md hover:bg-[#166534] transition-colors text-sm font-medium"
            >
              เข้าสู่ระบบ
            </button>
          )}
        </div>
        
        <h1 className="text-2xl font-bold text-[#15803D]">
          Crystal Resort: Room Status
        </h1>
        <div className="flex justify-center items-center gap-2">
          <p className="text-[#63738A] text-lg">{dateString}</p>
          <span className="text-[#63738A] text-lg">:</span>
          <p className="text-[#63738A] text-lg">{timeString}</p>
        </div>
      </div>

      {/* Team Notes Text Box - Login Required */}
      {isLoggedIn ? (
        <div className="mb-6">
          <label className="block text-lg font-bold text-[#15803D] mb-2">
            📝 ข้อความทีม (Team Notes)
          </label>
          <textarea
            value={teamNotes}
            onChange={(e) => {
              // Add bullet point if line doesn't start with one
              const lines = e.target.value.split('\n');
              const newValue = lines.map(line => {
                if (line.trim() && !line.trim().startsWith('•')) {
                  return '• ' + line.trim();
                }
                return line;
              }).join('\n');
              setTeamNotes(newValue);
            }}
            onKeyDown={(e) => {
              // Auto-add bullet on new line
              if (e.key === 'Enter') {
                const textarea = e.target;
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                const value = textarea.value;
                const before = value.substring(0, start);
                const after = value.substring(end);
                
                // Check if current line has bullet
                const lineStart = before.lastIndexOf('\n') + 1;
                const currentLine = before.substring(lineStart);
                
                // If current line is not empty and doesn't have bullet, add it
                if (currentLine.trim() && !currentLine.trim().startsWith('•')) {
                  e.preventDefault();
                  const newValue = before + '• ' + after;
                  setTeamNotes(newValue);
                  setTimeout(() => {
                    textarea.selectionStart = textarea.selectionEnd = start + 2;
                  }, 0);
                }
              }
            }}
            placeholder="• ห้อง 401 ต้องเปลี่ยนผ้าปูที่นอน
• ห้อง 509 เปิดน้ำไม่ออก
• แม่บ้านยูจะลาพรุ่งนี้"
            className="w-full min-h-[120px] p-4 text-lg font-bold text-black bg-white border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#15803D] resize-y"
            style={{ fontSize: '18px', lineHeight: '1.6' }}
          />
        </div>
      ) : (
        <div className="mb-6 p-4 bg-gray-100 border-2 border-gray-300 rounded-lg text-center">
          <p className="text-gray-600 font-medium">
            📝 ข้อความทีม (Team Notes) - กรุณาเข้าสู่ระบบเพื่อแก้ไข
          </p>
        </div>
      )}

      {/* Upload Buttons - Only visible to FO */}
      {nickname === "FO" && (
      <div className="flex justify-start gap-4 mb-3 flex-wrap">
        <button
          onClick={handleClearDataClick}
          disabled={!isLoggedIn || nickname !== "FO"}
          className={`px-4 py-2 rounded-lg shadow-md transition-colors inline-block select-none ${
            isLoggedIn && nickname === "FO"
              ? "cursor-pointer bg-red-600 text-white hover:bg-red-700"
              : "cursor-not-allowed bg-gray-400 text-gray-200 opacity-60"
          }`}
          title={!isLoggedIn ? "กรุณาเข้าสู่ระบบ" : nickname !== "FO" ? "เฉพาะผู้ใช้ FO เท่านั้น" : ""}
        >
          ลบข้อมูล
        </button>
        <div className="relative">
          <input 
            ref={inhouseFileInputRef}
            type="file" 
            accept=".pdf"
            id="inhouse-upload"
            className="hidden"
            disabled={!isLoggedIn || nickname !== "FO"}
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) {
                handleUpload("inhouse", file);
              }
            }}
          />
          <label 
            onClick={(e) => {
              // If disabled, prevent click
              if (!isLoggedIn || nickname !== "FO") {
                e.preventDefault();
                return;
              }
              // Trigger file input click programmatically
              e.preventDefault();
              if (inhouseFileInputRef.current) {
                inhouseFileInputRef.current.click();
              }
            }}
            className={`px-4 py-2 rounded-lg shadow-md transition-colors inline-block select-none ${
              isLoggedIn && nickname === "FO"
                ? "cursor-pointer bg-[#0F766E] text-white hover:bg-[#115e59]"
                : "cursor-not-allowed bg-gray-400 text-gray-200 opacity-60 pointer-events-none"
            }`}
            title={!isLoggedIn ? "กรุณาเข้าสู่ระบบ" : nickname !== "FO" ? "เฉพาะผู้ใช้ FO เท่านั้น" : ""}
          >
            📄 1. Upload In-House PDF
          </label>
        </div>
        <div className="relative">
          <input 
            ref={departureFileInputRef}
            type="file" 
            accept=".pdf"
            id="departure-upload"
            className="hidden"
            disabled={!isLoggedIn || nickname !== "FO"}
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) {
                handleUpload("departure", file);
              }
            }}
          />
          <label 
            onClick={(e) => {
              // If disabled, prevent click
              if (!isLoggedIn || nickname !== "FO") {
                e.preventDefault();
                return;
              }
              // Trigger file input click programmatically
              e.preventDefault();
              if (departureFileInputRef.current) {
                departureFileInputRef.current.click();
              }
            }}
            className={`px-4 py-2 rounded-lg shadow-md transition-colors inline-block select-none ${
              isLoggedIn && nickname === "FO"
                ? "cursor-pointer bg-[#15803D] text-white hover:bg-[#166534]"
                : "cursor-not-allowed bg-gray-400 text-gray-200 opacity-60 pointer-events-none"
            }`}
            title={!isLoggedIn ? "กรุณาเข้าสู่ระบบ" : nickname !== "FO" ? "เฉพาะผู้ใช้ FO เท่านั้น" : ""}
          >
            📄 2. Upload Expected Departure PDF
          </label>
        </div>
      </div>
      )}

      {/* Summary of rooms waiting to be cleaned - compact inline below first button */}
      <div className="flex items-center gap-4 mb-6 text-sm">
        <span className="font-semibold text-[#15803D]">สรุปจำนวนห้องที่รอเข้าทำ (วันนี้):</span>
        {(() => {
          // Calculate departure rooms count (Deluxe = 1, Suite = 2)
          const departureCount = [...new Set(departureRooms)].reduce((sum, roomNum) => {
            const room = rooms.find(r => String(r.number) === String(roomNum));
            if (room) {
              const isSuite = room.type.toUpperCase().startsWith("S");
              return sum + (isSuite ? 2 : 1);
            }
            return sum;
          }, 0);

          // Calculate in-house rooms count (Deluxe = 1, Suite = 2)
          // Exclude rooms that appear in both in-house and departure reports (intersection)
          // Exclude protected long stay rooms (206, 207, 503, 608, 609) from count
          const protectedRooms = ["206", "207", "503", "608", "609"];
          const departureRoomsSet = new Set(departureRooms.map(r => String(r)));
          const inhouseRoomsSet = new Set(inhouseRooms.map(r => String(r)));
          
          // Calculate: inhouseRooms - departureRooms (exclude intersection)
          const stayOverRooms = [...inhouseRoomsSet].filter(roomNum => 
            !departureRoomsSet.has(roomNum)
          );
          
          const inhouseCount = stayOverRooms.reduce((sum, roomNum) => {
            // Skip protected long stay rooms
            if (protectedRooms.includes(String(roomNum))) {
              return sum;
            }
            const room = rooms.find(r => String(r.number) === String(roomNum));
            if (room) {
              const isSuite = room.type.toUpperCase().startsWith("S");
              return sum + (isSuite ? 2 : 1);
            }
            return sum;
          }, 0);

          const total = departureCount + inhouseCount;

          return (
            <>
              <span>ห้อง check out: <span className="font-medium">{departureCount}</span></span>
              <span>ห้องพักต่อ: <span className="font-medium">{inhouseCount}</span></span>
              <span className="font-semibold">รวม: {total}</span>
            </>
          );
        })()}
      </div>

      {/* Floors */}
      <div className="space-y-3">
        {floors.map((roomsOnFloor, idx) => (
          <div key={idx} className="flex items-center gap-3">
            <div className="flex-shrink-0 w-16 text-center">
              <h2 className="font-semibold text-[#15803D] text-lg">
                ชั้น {6 - idx}
              </h2>
            </div>
            <div className="flex-1 overflow-x-auto">
              <div className="flex gap-1.5 min-w-max">
                {roomsOnFloor.map(r => (
                  <RoomCard 
                    key={r.number} 
                    room={r} 
                    setRooms={setRooms}
                    isLoggedIn={isLoggedIn}
                    onLoginRequired={() => setShowLoginModal(true)}
                    currentNickname={nickname}
                    currentDate={remarkDateString}
                    setIsManualEdit={(value, roomNumber) => { 
                      // No longer needed - protection removed per requirements
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Maid summary */}
      <div className="mt-8 bg-white rounded-2xl p-4 shadow-md max-w-md mx-auto">
        <h3 className="font-semibold text-center text-[#15803D] mb-2">
          สรุปการส่งห้องของแม่บ้าน (วันนี้)
        </h3>
        <table className="w-full text-sm">
          <thead><tr className="border-b">
            <th className="text-left">แม่บ้าน</th>
            <th className="text-right">ห้อง</th>
          </tr></thead>
          <tbody>
            {maidEntries.length > 0 ? (
              maidEntries.map(([maid, score]) => (
                <tr key={maid}>
                  <td>{maid}</td>
                  <td className="text-right">{score}</td>
                </tr>
              ))
            ) : (
              <tr>
                    <td colSpan="2" className="text-center text-[#63738A] text-xs py-2">
                      ยังไม่มีการทำวันนี้
                    </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Color Legend */}
      <div className="mt-6 bg-white rounded-2xl p-4 shadow-md max-w-md mx-auto">
        <h3 className="font-semibold text-center text-[#15803D] mb-3">
          ความหมายของสีห้อง
        </h3>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded bg-green-200 flex-shrink-0"></div>
            <span>ทำห้องเสร็จแล้ว</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded bg-gray-500 flex-shrink-0"></div>
            <span>ปิดห้อง</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded bg-red-300 flex-shrink-0"></div>
            <span>ออกแล้ว</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded bg-white border border-gray-300 flex-shrink-0"></div>
            <span>ว่าง</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded bg-blue-200 flex-shrink-0"></div>
            <span>พักต่อ</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded bg-yellow-200 flex-shrink-0"></div>
            <span>จะออกวันนี้</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded bg-gray-200 flex-shrink-0"></div>
            <span>รายเดือน</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

