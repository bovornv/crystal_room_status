import React, { useState, useEffect, useRef } from "react";
import RoomCard from "./RoomCard";
import CommonAreaCard from "./CommonAreaCard";
import * as pdfjsLib from "pdfjs-dist";
import { db } from "../services/firebase";
import { collection, doc, getDoc, getDocs, setDoc, onSnapshot, serverTimestamp } from "firebase/firestore";

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
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [nickname, setNickname] = useState("");
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showClearConfirmModal, setShowClearConfirmModal] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [teamNotes, setTeamNotes] = useState("");
  const isSavingNotes = useRef(false);
  const notesTextareaRef = useRef(null);
  const [commonAreas, setCommonAreas] = useState([]);
  const [departureRoomCount, setDepartureRoomCount] = useState(0); // Count from expected departure PDF
  const [inhouseRoomCount, setInhouseRoomCount] = useState(0); // Count from in-house PDF
  const [showUnoccupiedRooms, setShowUnoccupiedRooms] = useState(false); // Toggle showing rooms unoccupied for 3+ days
  const [unoccupiedRooms3d, setUnoccupiedRooms3d] = useState(new Set()); // Set of room numbers unoccupied for 3+ days
  
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
      const storedNickname = localStorage.getItem('nickname') || localStorage.getItem('crystal_nickname');
      const loginTimestamp = localStorage.getItem('crystal_login_timestamp');
      const logoutTimestamp = localStorage.getItem('crystal_logout_timestamp');
      
      // Check if user was logged out on another device
      if (storedNickname && loginTimestamp && logoutTimestamp) {
        const loginTime = parseInt(loginTimestamp);
        const logoutTime = parseInt(logoutTimestamp);
        
        // If logout happened after login, user is logged out
        if (logoutTime > loginTime) {
          localStorage.removeItem('crystal_nickname');
          localStorage.removeItem('nickname');
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

  // Load team notes from Firestore on mount and set up real-time listener
  useEffect(() => {
    const notesDoc = doc(db, "notes", "today");
    
    // Set up real-time listener for team notes
    const unsubscribe = onSnapshot(notesDoc, (snapshot) => {
      // Skip update if we're currently saving or if textarea is focused (user is editing)
      if (isSavingNotes.current || (notesTextareaRef.current && document.activeElement === notesTextareaRef.current)) {
        return;
      }
      
      if (snapshot.exists()) {
        const data = snapshot.data();
        setTeamNotes(data.text || "");
        // Update localStorage as backup
        try {
          localStorage.setItem('crystal_team_notes', data.text || "");
        } catch (error) {
          console.error("Error saving to localStorage:", error);
        }
      } else {
        // Document doesn't exist, initialize with empty string
        setTeamNotes("");
      }
    }, (error) => {
      console.error("Error listening to team notes:", error);
      // Fallback to localStorage if Firestore fails
      const storedNotes = localStorage.getItem('crystal_team_notes');
      if (storedNotes) {
        setTeamNotes(storedNotes);
      }
    });

    return () => unsubscribe();
  }, []);

  // Load common areas from Firestore and set up real-time listener
  useEffect(() => {
    const commonAreasCollection = collection(db, "commonAreas");
    
    const unsubscribe = onSnapshot(commonAreasCollection, (snapshot) => {
      const areas = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setCommonAreas(areas);
    }, (error) => {
      console.error("Error listening to common areas:", error);
    });

    return () => unsubscribe();
  }, []);

  // Load report counts from Firestore
  useEffect(() => {
    const countsDoc = doc(db, "reports", "counts");
    
    const unsubscribe = onSnapshot(countsDoc, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setDepartureRoomCount(data.departureRoomCount || 0);
        setInhouseRoomCount(data.inhouseRoomCount || 0);
      }
    }, (error) => {
      console.error("Error listening to report counts:", error);
    });

    return () => unsubscribe();
  }, []);

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

  // Ref to track initial load to prevent double-loading
  const isInitialLoad = useRef(true);
  const isUploadingPDF = useRef(false);
  const inhouseFileInputRef = useRef(null); // Ref for inhouse file input
  const departureFileInputRef = useRef(null); // Ref for departure file input
  
  // Helper function to immediately update Firestore (for real-time sync)
  const updateFirestoreImmediately = async (updatedRooms) => {
    try {
      const roomsCollection = collection(db, "rooms");
      const roomsDoc = doc(roomsCollection, "allRooms");
      
      const migratedRooms = migrateMovedOutToCheckedOut(updatedRooms);
      const payload = {
        rooms: migratedRooms,
        lastUpdated: new Date().toISOString()
      };
      
      await setDoc(roomsDoc, payload, { merge: true });
      
      // Update localStorage for local persistence
      try {
        localStorage.setItem('crystal_rooms', JSON.stringify(updatedRooms));
      } catch (error) {
        console.error("Error saving to localStorage:", error);
      }
      
      console.log("✅ Firestore updated immediately - real-time sync triggered");
    } catch (error) {
      console.error("Error updating Firestore:", error);
    }
  };

  // Wrapper function for RoomCard to update a single room immediately (for real-time sync)
  const updateRoomImmediately = async (roomNumber, roomUpdates) => {
    // Use functional update to ensure we have the latest state
    setRooms(prevRooms => {
      const updatedRooms = prevRooms.map(r => {
        if (String(r.number) === String(roomNumber)) {
          const updated = { ...r, ...roomUpdates };
          // Track when room becomes vacant
          if (updated.status === "vacant" && r.status !== "vacant") {
            updated.vacantSince = new Date().toISOString();
          } else if (updated.status !== "vacant" && r.status === "vacant") {
            // Clear vacantSince when room becomes occupied
            updated.vacantSince = undefined;
          } else if (updated.status === "vacant" && r.status === "vacant") {
            // Preserve vacantSince if room stays vacant
            updated.vacantSince = r.vacantSince || new Date().toISOString();
          }
          return updated;
        }
        return r;
      });
      
      // Update Firestore immediately for real-time sync (no debounce)
      // Firestore update happens asynchronously, won't block state update
      updateFirestoreImmediately(updatedRooms).catch(err => {
        console.error("Error updating room in Firestore:", err);
      });
      
      return updatedRooms;
    });
  };

  // Default rooms data (fallback if Firestore is empty)
  const defaultRooms = [
    // Floor 6
    { number: "601", type: "S", floor: 6, status: "vacant", maid: "", remark: "", cleanedToday: false, border: "black" },
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
    { number: "301", type: "D6", floor: 3, status: "vacant", maid: "", remark: "", cleanedToday: false },
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
    { number: "206", type: "D5", floor: 2, status: "vacant", maid: "", remark: "", cleanedToday: false },
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
  // Also ensure all rooms have a border field (default to black if missing)
  // Initialize vacantSince for vacant rooms that don't have it
  const migrateMovedOutToCheckedOut = (roomsArray) => {
    return roomsArray.map(r => {
      const migrated = r.status === "moved_out" ? { ...r, status: "checked_out" } : r;
      // Ensure border field exists (default to black if missing)
      if (!migrated.border) {
        migrated.border = "black";
      }
      // Initialize vacantSince for vacant rooms that don't have it
      if (migrated.status === "vacant" && !migrated.vacantSince) {
        migrated.vacantSince = new Date().toISOString();
      } else if (migrated.status !== "vacant") {
        // Clear vacantSince when room is not vacant
        migrated.vacantSince = undefined;
      }
      return migrated;
    });
  };

  // Rooms state - Firestore is the single source of truth
  // Start with empty array, Firestore will populate it via onSnapshot
  const [rooms, setRooms] = useState([]);

  // Initialize Firestore sync - Firestore is the single source of truth
  useEffect(() => {
    const roomsCollection = collection(db, "rooms");
    const roomsDoc = doc(roomsCollection, "allRooms");

    // Load from Firestore once on initial mount (only if document exists)
    const loadFromFirestoreOnce = async () => {
      try {
        const snapshot = await getDoc(roomsDoc);
      if (snapshot.exists()) {
        const data = snapshot.data();
          if (data.rooms && Array.isArray(data.rooms) && data.rooms.length > 0) {
            // Firestore has data, use it
            const migratedRooms = migrateMovedOutToCheckedOut(data.rooms);
            setRooms(migratedRooms);
            console.log("✅ Initial load from Firestore completed");
          } else {
            // Firestore document exists but no rooms array, initialize with defaultRooms
            const migratedRooms = migrateMovedOutToCheckedOut(defaultRooms);
            setRooms(migratedRooms);
            // Write to Firestore to initialize
            setDoc(roomsDoc, {
              rooms: migratedRooms,
              lastUpdated: new Date().toISOString()
            }, { merge: true }).catch(err => console.error("Error initializing Firestore:", err));
            console.log("✅ Initialized Firestore with default rooms");
          }
        } else {
          // Document doesn't exist, initialize with defaultRooms
          const migratedRooms = migrateMovedOutToCheckedOut(defaultRooms);
          setRooms(migratedRooms);
          // Write to Firestore to initialize
          setDoc(roomsDoc, {
            rooms: migratedRooms,
            lastUpdated: new Date().toISOString()
          }, { merge: true }).catch(err => console.error("Error initializing Firestore:", err));
          console.log("✅ Initialized Firestore with default rooms");
        }
      } catch (error) {
        console.error("Error loading from Firestore:", error);
        // On error during initial load, use defaultRooms as fallback
        // This only happens if Firestore is completely unavailable
        const migratedRooms = migrateMovedOutToCheckedOut(defaultRooms);
        setRooms(migratedRooms);
      }
      isInitialLoad.current = false;
    };

    loadFromFirestoreOnce();

    // Set up real-time listener - Firestore is the ONLY data feed to UI
    // This listener is the single source of truth for all room updates
    const unsubscribe = onSnapshot(roomsDoc, (snapshot) => {
      // Skip during initial load to prevent double-loading
      if (isInitialLoad.current) {
                return;
      }
      
      // Skip during PDF upload to prevent overwriting bulk updates
      if (isUploadingPDF.current) {
                return;
              }
      
      if (snapshot.exists()) {
        const data = snapshot.data();
        
        if (data.rooms && Array.isArray(data.rooms)) {
          // Firestore is the source of truth - always accept updates
          const migratedRooms = migrateMovedOutToCheckedOut(data.rooms);
          setRooms(migratedRooms);
          
          // Update localStorage as read-only backup (don't use it to overwrite Firestore)
          try {
            localStorage.setItem('crystal_rooms', JSON.stringify(migratedRooms));
          } catch (error) {
            console.error("Error saving to localStorage:", error);
          }
          
          console.log(`✅ Real-time sync: Updated from Firestore - ${migratedRooms.length} rooms`);
        }
      }
    }, (error) => {
      console.error("Error listening to Firestore:", error);
      // DO NOT reset rooms on error - keep current state intact
    });

    return () => unsubscribe();
  }, []); // Empty dependency array - only run once on mount

  // Fix rooms 301 and 316 type to D6 if they're wrong (migration)
  useEffect(() => {
    if (rooms.length === 0) return;
    
    const room301 = rooms.find(r => String(r.number) === "301");
    const room316 = rooms.find(r => String(r.number) === "316");
    const needsUpdate = (room301 && room301.type !== "D6") || (room316 && room316.type !== "D6");
    
    if (needsUpdate) {
      console.log("🔧 Fixing rooms 301 and 316 type to D6");
      const updatedRooms = rooms.map(r => {
        if (String(r.number) === "301" && r.type !== "D6") {
          return { ...r, type: "D6" };
        }
        if (String(r.number) === "316" && r.type !== "D6") {
          return { ...r, type: "D6" };
        }
        return r;
      });
      setRooms(updatedRooms);
      updateFirestoreImmediately(updatedRooms).catch(err => {
        console.error("Error fixing rooms 301 and 316 in Firestore:", err);
      });
    }
  }, [rooms.length]); // Run when rooms are loaded

  // localStorage is updated by onSnapshot listener above
  // No separate useEffect needed - Firestore is the source of truth

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
      let textItemsWithPosition = []; // Store text items with positions for date and column extraction
      let firstPage = null; // Store first page reference for viewport
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(" ");
        allText += " " + pageText;
        
        // Store text items with positions for first page (where date usually is)
        if (i === 1) {
          firstPage = page;
          textItemsWithPosition = textContent.items.map(item => ({
            str: item.str,
            x: item.transform ? item.transform[4] : 0,
            y: item.transform ? item.transform[5] : 0,
          }));
        }
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
      // After Expected Departure PDF upload, ALWAYS assign gray-200 (long_stay) to long-stay rooms: 207, 503, 608, 609
      // Calculate updated rooms first, then update state
      const longStayRooms = ["207", "503", "608", "609"];
      const updatedRooms = rooms.map(r => {
        // Convert to string for comparison
        const roomNumStr = String(r.number);
        const isInPDF = validExistingRooms.some(pdfRoom => String(pdfRoom) === roomNumStr);
        const isLongStay = longStayRooms.includes(roomNumStr);
        
        // After Expected Departure PDF upload, ALWAYS assign gray-200 (long_stay) to long-stay rooms
        // This happens regardless of whether they appear in the PDF
        if (type === "departure" && isLongStay) {
          console.log(`Auto-assigning long-stay room ${r.number} to gray-200 (long_stay)`);
          return { ...r, status: "long_stay", cleanedToday: false, border: r.border || "black" };
        }
        
        // Only update rooms found in the PDF
        if (isInPDF) {
          if (type === "inhouse") {
            // In-House PDF: set to blue (stay_clean)
            // Preserve border (keep existing or default to black)
            // Clear vacantSince when room becomes occupied
            console.log(`Updating room ${r.number} to stay_clean (blue)`);
            return { ...r, status: "stay_clean", cleanedToday: false, border: r.border || "black", vacantSince: undefined };
          }
          if (type === "departure") {
            // Expected Departure PDF: set to yellow (will_depart_today)
            // Preserve border (keep existing or default to black)
            // Skip if it's a long-stay room (already handled above - they become gray-200/long_stay)
            // Clear vacantSince when room becomes occupied
            if (!isLongStay) {
              console.log(`Updating room ${r.number} to will_depart_today (yellow)`);
              return { ...r, status: "will_depart_today", cleanedToday: false, border: r.border || "black", vacantSince: undefined };
            }
          }
        }
        // For rooms not in PDF, preserve vacantSince if room is vacant
        if (r.status === "vacant" && !r.vacantSince) {
          return { ...r, vacantSince: new Date().toISOString() };
        }
        // Return room unchanged if not in PDF and not a long-stay room
        return r;
      });

      // Update state with calculated rooms
      setRooms(updatedRooms);

      console.log("Updated rooms count:", updatedRooms.filter(r => {
        const roomNumStr = String(r.number);
        const isInPDF = validExistingRooms.some(pdfRoom => String(pdfRoom) === roomNumStr);
        return isInPDF && (type === "departure" ? r.status === "will_depart_today" : r.status === "stay_clean");
      }).length);

      // Count how many rooms actually changed status (before setRooms updates state)
      const changedRooms = updatedRooms.filter((r) => {
        const originalRoom = rooms.find(or => String(or.number) === String(r.number));
        return originalRoom && originalRoom.status !== r.status;
      });
      
      console.log(`📊 PDF Upload Summary: ${changedRooms.length} rooms changed status`);
      console.log(`   Changed rooms:`, changedRooms.map(r => `${r.number}: ${rooms.find(or => String(or.number) === String(r.number))?.status} → ${r.status}`));

      // Store room count from PDF (column 1 count)
      if (type === "departure") {
        setDepartureRoomCount(validExistingRooms.length);
        // Save to Firestore
        await setDoc(doc(db, "reports", "counts"), {
          departureRoomCount: validExistingRooms.length,
        }, { merge: true });
      } else if (type === "inhouse") {
        setInhouseRoomCount(validExistingRooms.length);
        // Save to Firestore
        await setDoc(doc(db, "reports", "counts"), {
          inhouseRoomCount: validExistingRooms.length,
        }, { merge: true });
        
        // Extract date from PDF and store room numbers in date-named array
        try {
          // Find "Date" text and extract date from right side (top right area)
          let extractedDate = null;
          
          // Find items in top right area (high Y values, high X values)
          const topRightItems = textItemsWithPosition
            .filter(item => item.y > 700 && item.x > 300) // Adjust thresholds based on PDF layout
            .sort((a, b) => {
              if (Math.abs(a.y - b.y) > 5) return b.y - a.y; // Top to bottom
              return a.x - b.x; // Left to right
            });
          
          // Look for "Date" text and find date immediately after it
          const dateIndex = topRightItems.findIndex(item => 
            item.str.toLowerCase().includes("date") || item.str === "Date"
          );
          
          if (dateIndex !== -1 && dateIndex < topRightItems.length - 1) {
            // Look for date pattern in text items near "Date"
            const searchItems = topRightItems.slice(dateIndex, dateIndex + 10);
            const dateText = searchItems.map(item => item.str).join(" ");
            
            // Try various date patterns: DD/MM/YYYY, DD-MM-YYYY, DD MM YYYY
            const datePatterns = [
              /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/,  // DD/MM/YYYY or DD-MM-YYYY
              /(\d{1,2})\s+(\d{1,2})\s+(\d{4})/,        // DD MM YYYY
              /(\d{2})[\/\-](\d{2})[\/\-](\d{4})/,       // DD/MM/YYYY (2 digits)
            ];
            
            for (const pattern of datePatterns) {
              const match = dateText.match(pattern);
              if (match) {
                const day = match[1].padStart(2, '0');
                const month = match[2].padStart(2, '0');
                const year = match[3];
                extractedDate = `${day}_${month}_${year}`;
                break;
              }
            }
          }
          
          // If still not found, search entire text for date pattern
          if (!extractedDate) {
            const datePattern = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/;
            const dateMatch = allText.match(datePattern);
            if (dateMatch) {
              const day = dateMatch[1].padStart(2, '0');
              const month = dateMatch[2].padStart(2, '0');
              const year = dateMatch[3];
              extractedDate = `${day}_${month}_${year}`;
            }
          }
          
          // If date not found, use current date
          if (!extractedDate) {
            const today = new Date();
            const day = String(today.getDate()).padStart(2, '0');
            const month = String(today.getMonth() + 1).padStart(2, '0');
            const year = today.getFullYear();
            extractedDate = `${day}_${month}_${year}`;
            console.log("⚠️ Date not found in PDF, using current date:", extractedDate);
          }
          
          // Extract room numbers from first column
          // Get page dimensions to determine column boundaries
          const viewport = firstPage.getViewport({ scale: 1.0 });
          const pageWidth = viewport.width;
          
          // Assume first column is in left 30% of page (adjust if needed)
          const firstColumnMaxX = pageWidth * 0.3;
          
          // Filter items that are likely in first column (left side, not header)
          const firstColumnItems = textItemsWithPosition.filter(item => 
            item.x < firstColumnMaxX && item.y < 700 // Below header area
          );
          
          // Group by Y position (rows) and extract leftmost room number from each row
          const rows = {};
          firstColumnItems.forEach(item => {
            const rowKey = Math.round(item.y / 5) * 5; // Group by Y position with smaller tolerance
            if (!rows[rowKey]) rows[rowKey] = [];
            rows[rowKey].push(item);
          });
          
          const firstColumnRooms = [];
          const roomNumberPattern = /^\d{3}$/;
          
          // Sort rows from top to bottom, then extract leftmost room number
          Object.keys(rows)
            .sort((a, b) => parseFloat(b) - parseFloat(a)) // Top to bottom
            .forEach(rowKey => {
              const rowItems = rows[rowKey].sort((a, b) => a.x - b.x); // Left to right
              // Find first valid room number in this row
              for (const item of rowItems) {
                if (roomNumberPattern.test(item.str)) {
                  const roomNum = item.str;
                  if (validExistingRooms.includes(roomNum) && !firstColumnRooms.includes(roomNum)) {
                    firstColumnRooms.push(roomNum);
                    break; // Only take first room number from this row
                  }
                }
              }
            });
          
          // If we couldn't extract from positions, use all valid rooms as fallback
          const roomsToStore = firstColumnRooms.length > 0 ? firstColumnRooms : validExistingRooms;
          
          // Store in Firestore with date-based key
          const arrayKey = `occupied_rooms_${extractedDate}`;
          await setDoc(doc(db, "reports", arrayKey), {
            rooms: roomsToStore,
            date: extractedDate,
            uploadedAt: new Date().toISOString(),
          }, { merge: true });
          
          console.log(`✅ Stored ${roomsToStore.length} rooms in ${arrayKey}:`, roomsToStore);
        } catch (error) {
          console.error("Error storing occupied rooms:", error);
        }
      }

      // Write to Firestore immediately for real-time sync
      await updateFirestoreImmediately(updatedRooms);
        console.log(`✅ PDF upload synced to Firestore - ${validExistingRooms.length} rooms updated`);

      // Show success toast with count
      const statusText = type === "departure" ? "จะออกวันนี้" : "พักต่อ";
      alert(`${validExistingRooms.length} ห้องถูกอัปเดตเป็นสถานะ ${statusText}`);
      
      // Reset file input so the same file can be uploaded again
      if (type === "inhouse" && inhouseFileInputRef.current) {
        inhouseFileInputRef.current.value = "";
      } else if (type === "departure" && departureFileInputRef.current) {
        departureFileInputRef.current.value = "";
      }
      
      // Reset flag after Firestore write completes (short delay for safety)
      setTimeout(() => {
        isUploadingPDF.current = false;
        console.log("PDF upload flag reset");
      }, 2000); // 2 seconds is enough for Firestore write to complete
    } catch (error) {
      console.error("Error processing PDF:", error);
      alert(`เกิดข้อผิดพลาดในการประมวลผล PDF: ${error.message}`);
      isUploadingPDF.current = false;
    }
  };

  // Show all rooms, but mark unoccupied ones for purple highlighting
  const filteredRooms = rooms;

  const floors = [6,5,4,3,2,1].map(f =>
    filteredRooms.filter(r => r.floor === f)
  );

  // Calculate maid scores dynamically
  // Deluxe = 1pt, Suite = 2pts, count both green (cleaned) and cyan (cleaned_stay) rooms
  // Track by nickname (maid field) when status is changed to "cleaned" or "cleaned_stay"
  const calculateMaidScores = () => {
    const scores = {};
    rooms.forEach(room => {
      if ((room.status === "cleaned" || room.status === "cleaned_stay") && room.maid) {
        const isSuite = room.type?.toUpperCase().startsWith("S");
        const points = isSuite ? 2 : 1;
        const nickname = room.maid.trim();
        if (nickname) {
        scores[nickname] = (scores[nickname] || 0) + points;
        }
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
    
    try {
      // "ลบข้อมูล" logic: Set ALL rooms to white (vacant) with black border
      // Clear all maid nicknames and lastEditor from ALL rooms
      // Do not delete remark dot or remark text
      const clearedRooms = rooms.map(r => {
        return {
          ...r,
          status: "vacant", // ALL rooms become white (vacant)
          maid: "", // Clear maid nickname from ALL rooms
          lastEditor: "", // Clear lastEditor from ALL rooms
          selectedBy: "",
          cleanedBy: "",
          cleanedToday: false,
          border: "black", // ALL rooms get black border
          remark: r.remark || "", // Preserve remark - do not delete
          vacantSince: new Date().toISOString() // Initialize vacantSince when clearing
        };
      });

      // Update local state
      setRooms(clearedRooms);
      
      // Clear report counts
      setDepartureRoomCount(0);
      setInhouseRoomCount(0);
      await setDoc(doc(db, "reports", "counts"), {
        departureRoomCount: 0,
        inhouseRoomCount: 0,
      }, { merge: true });

      // Write rooms to Firestore immediately for real-time sync
      await updateFirestoreImmediately(clearedRooms);
      console.log("✅ Clear rooms data synced to Firestore");
      console.log(`Cleared ${clearedRooms.filter(r => r.status === "vacant").length} rooms to vacant`);

      // --- Clear all common area data ---
      const areaSnapshot = await getDocs(collection(db, "commonAreas"));
      console.log(`📋 Found ${areaSnapshot.docs.length} common area documents to clear`);
      
      if (areaSnapshot.docs.length === 0) {
        console.log("⚠️ No common area documents found in Firestore");
      }
      
      const areaPromises = areaSnapshot.docs.map(async (docSnap) => {
        // Use the document ID from Firestore (it's already stored correctly)
        const docId = docSnap.id;
        const data = docSnap.data();
        
        // Skip if document doesn't have required fields
        if (!data.area || !data.time) {
          console.warn(`⚠️ Skipping document ${docId} - missing area or time field`, data);
          return;
        }
        
        console.log(`🔄 Clearing area: ${docId}`, { 
          area: data.area, 
          time: data.time, 
          currentStatus: data.status, 
          currentMaid: data.maid,
          currentBorder: data.border 
        });
        
        try {
          // Explicitly set all fields to reset state
          const updateData = {
            status: "waiting", // Reset to red (รอทำ)
            maid: "", // Clear maid nickname - explicitly set to empty string
            border: "black", // Reset border to black
          };
          
          // Preserve area and time if they exist
          if (data.area) updateData.area = data.area;
          if (data.time) updateData.time = data.time;
          
          await setDoc(
            doc(db, "commonAreas", docId),
            updateData,
            { merge: true }
          );
          console.log(`✅ Cleared area ${docId}`, updateData);
        } catch (err) {
          console.error(`❌ Error clearing area ${docId}:`, err);
          throw err;
        }
      });

      await Promise.all(areaPromises);
      console.log(`✅ Successfully cleared ${areaSnapshot.docs.length} common areas to waiting state`);

      alert("ข้อมูลทั้งหมดถูกล้างเรียบร้อยแล้ว ✅");
    } catch (error) {
      console.error("Error clearing data:", error);
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

      {/* Team Notes Text Box - Compact, visible to all */}
      <div className="mb-1">
        <div className="flex items-center justify-between gap-1 mb-0.5">
          <label className="text-sm sm:text-base font-bold text-[#15803D]">
            📝 ข้อความสำคัญ (วันนี้)
          </label>
          {isLoggedIn && (
            <button
              onClick={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                if (isSavingNotes.current) {
                  return;
                }
                
                try {
                  isSavingNotes.current = true;
                  const notesDoc = doc(db, "notes", "today");
                  await setDoc(notesDoc, { 
                    text: teamNotes,
                    lastUpdated: serverTimestamp()
                  }, { merge: true });
                  console.log("✅ Team notes saved to Firestore");
                  
                  setTimeout(() => {
                    isSavingNotes.current = false;
                  }, 500);
                  
                  alert("✅ บันทึกเรียบร้อย");
                } catch (error) {
                  console.error("Error saving team notes:", error);
                  isSavingNotes.current = false;
                  alert("เกิดข้อผิดพลาดในการบันทึก: " + error.message);
                }
              }}
              type="button"
              className="px-2 py-0.5 bg-[#15803D] text-white rounded text-xs font-bold hover:bg-[#166534] transition-colors whitespace-nowrap"
            >
              บันทึก
            </button>
          )}
        </div>
        {teamNotes.trim() || isLoggedIn ? (
          <textarea
            ref={notesTextareaRef}
            value={teamNotes}
            onChange={(e) => {
              if (isLoggedIn) {
                setTeamNotes(e.target.value);
              }
            }}
            readOnly={!isLoggedIn}
            placeholder={isLoggedIn ? "" : "ข้อความสำคัญวันนี้"}
            className={`w-full p-1.5 text-sm sm:text-base bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#15803D] resize-none ${
              teamNotes.trim() 
                ? 'text-black font-bold' 
                : isLoggedIn 
                  ? 'text-gray-500 font-normal' 
                  : 'text-gray-400 font-normal'
            }`}
            style={{ 
              minHeight: '36px',
              maxHeight: '50px',
              lineHeight: '1.3',
            }}
          />
        ) : (
          <div className="w-full p-1.5 text-sm sm:text-base bg-white border border-gray-300 rounded-lg text-gray-400 min-h-[36px] flex items-center font-normal">
            ข้อความสำคัญวันนี้
          </div>
        )}
      </div>

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
        {nickname === "FO" && (
          <button
            onClick={async () => {
              if (!showUnoccupiedRooms) {
                // Compute unoccupied_rooms_3d
                try {
                  // Step 1: Get date, month, year of today from the system
                  const today = new Date();
                  const day = String(today.getDate()).padStart(2, '0');
                  const month = String(today.getMonth() + 1).padStart(2, '0');
                  const year = today.getFullYear();
                  
                  // Step 2: Format today as DD_MM_YYYY
                  const todayStr = `${day}_${month}_${year}`;
                  
                  // Step 3: Calculate 1 day ago and 2 days ago
                  const oneDayAgo = new Date(today);
                  oneDayAgo.setDate(oneDayAgo.getDate() - 1);
                  const oneDayAgoDay = String(oneDayAgo.getDate()).padStart(2, '0');
                  const oneDayAgoMonth = String(oneDayAgo.getMonth() + 1).padStart(2, '0');
                  const oneDayAgoYear = oneDayAgo.getFullYear();
                  const oneDayAgoStr = `${oneDayAgoDay}_${oneDayAgoMonth}_${oneDayAgoYear}`;
                  
                  const twoDaysAgo = new Date(today);
                  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
                  const twoDaysAgoDay = String(twoDaysAgo.getDate()).padStart(2, '0');
                  const twoDaysAgoMonth = String(twoDaysAgo.getMonth() + 1).padStart(2, '0');
                  const twoDaysAgoYear = twoDaysAgo.getFullYear();
                  const twoDaysAgoStr = `${twoDaysAgoDay}_${twoDaysAgoMonth}_${twoDaysAgoYear}`;
                  
                  console.log(`📅 Date calculation:`);
                  console.log(`   Today: ${todayStr}`);
                  console.log(`   1 day ago: ${oneDayAgoStr}`);
                  console.log(`   2 days ago: ${twoDaysAgoStr}`);
                  
                  // Step 4: Fetch occupied_rooms arrays from Firestore
                  const reportsCollection = collection(db, "reports");
                  const snapshot = await getDocs(reportsCollection);
                  
                  // Step 5: Collect union of occupied_rooms_today, occupied_rooms_1_day_ago, occupied_rooms_2_days_ago
                  const occupiedRoomsSet = new Set();
                  
                  snapshot.docs.forEach(doc => {
                    const docId = doc.id;
                    if (docId.startsWith("occupied_rooms_")) {
                      const dateStr = docId.replace("occupied_rooms_", "");
                      // Check if this date matches today, 1 day ago, or 2 days ago
                      if (dateStr === todayStr || dateStr === oneDayAgoStr || dateStr === twoDaysAgoStr) {
                        const data = doc.data();
                        if (data.rooms && Array.isArray(data.rooms)) {
                          data.rooms.forEach(roomNum => {
                            occupiedRoomsSet.add(String(roomNum));
                          });
                          console.log(`   Found ${data.rooms.length} rooms in ${docId}`);
                        }
                      }
                    }
                  });
                  
                  // Step 6: Compute unoccupied_rooms_3d = all rooms - union(occupied_rooms_today, occupied_rooms_1_day_ago, occupied_rooms_2_days_ago)
                  const allRoomNumbers = rooms.map(r => String(r.number));
                  const unoccupied3d = allRoomNumbers.filter(roomNum => !occupiedRoomsSet.has(roomNum));
                  
                  setUnoccupiedRooms3d(new Set(unoccupied3d));
                  setShowUnoccupiedRooms(true);
                  
                  console.log(`✅ Computed unoccupied_rooms_3d: ${unoccupied3d.length} rooms`);
                  console.log(`   Total rooms: ${allRoomNumbers.length}`);
                  console.log(`   Occupied rooms (union of last 3 days): ${occupiedRoomsSet.size}`);
                  console.log(`   Unoccupied rooms:`, unoccupied3d);
                } catch (error) {
                  console.error("Error computing unoccupied rooms:", error);
                  alert("เกิดข้อผิดพลาดในการคำนวณห้องที่ว่าง: " + error.message);
                }
              } else {
                // Toggle off - clear the unoccupied rooms set
                setUnoccupiedRooms3d(new Set());
                setShowUnoccupiedRooms(false);
              }
            }}
            className={`px-4 py-2 rounded-lg shadow-md transition-colors inline-block select-none ${
              showUnoccupiedRooms
                ? "bg-purple-600 text-white hover:bg-purple-700"
                : "bg-purple-500 text-white hover:bg-purple-600"
            }`}
          >
            3. Show Rooms Unoccupied Over last 3 days
          </button>
        )}
      </div>
      )}

      {/* Summary of rooms waiting to be cleaned - compact inline below first button */}
      <div className="flex items-center gap-4 mb-6 text-sm">
        <span className="font-semibold text-[#15803D]">สรุปจำนวนห้องที่รอเข้าทำ (วันนี้):</span>
        {(() => {
          // Use counts from PDF uploads
          // ห้องออกวันนี้ = number of rooms from expected departure PDF (column 1)
          const departureCount = departureRoomCount;

          // ห้องพักต่อ = number of rooms from in-house PDF (column 1) - number of rooms from expected departure PDF (column 1)
          const inhouseCount = Math.max(0, inhouseRoomCount - departureRoomCount);

          const total = departureCount + inhouseCount;

          return (
            <>
              <span>ห้องออกวันนี้: <span className="font-medium">{departureCount}</span></span>
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
                {roomsOnFloor.map(r => {
                  const isUnoccupied = showUnoccupiedRooms && unoccupiedRooms3d.has(String(r.number));
                  return (
                  <RoomCard 
                    key={r.number} 
                    room={r} 
                    updateRoomImmediately={updateRoomImmediately}
                    isLoggedIn={isLoggedIn}
                    onLoginRequired={() => setShowLoginModal(true)}
                    currentNickname={nickname}
                    currentDate={remarkDateString}
                    isUnoccupied={isUnoccupied}
                  />
                );
                })}
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
            <th className="text-right">คะแนน</th>
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

      {/* ส่วนกลาง (Common Areas) */}
      <div className="mt-6 bg-white rounded-2xl p-4 shadow-md max-w-4xl mx-auto">
        <h3 className="font-semibold text-center text-[#15803D] mb-4 text-lg sm:text-xl">
          ส่วนกลาง
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm sm:text-base">
            <thead>
              <tr className="border-b">
                <th className="text-left p-2 text-base sm:text-lg font-semibold">พื้นที่</th>
                <th className="text-center p-2 text-base sm:text-lg font-semibold">เช้า</th>
                <th className="text-center p-2 text-base sm:text-lg font-semibold">บ่าย</th>
              </tr>
            </thead>
            <tbody>
              {/* ล็อบบี้ */}
              <tr>
                <td className="p-2 font-medium text-base sm:text-lg">ล็อบบี้</td>
                <td className="p-2">
                  <CommonAreaCard
                    area="ล็อบบี้"
                    time="เช้า"
                    data={commonAreas.find(a => a.id === "lobby-morning")}
                    nickname={nickname}
                    isFO={nickname === "FO"}
                  />
                </td>
                <td className="p-2">
                  <CommonAreaCard
                    area="ล็อบบี้"
                    time="บ่าย"
                    data={commonAreas.find(a => a.id === "lobby-afternoon")}
                    nickname={nickname}
                    isFO={nickname === "FO"}
                  />
                </td>
              </tr>
              {/* ห้องน้ำสวน */}
              <tr>
                <td className="p-2 font-medium text-base sm:text-lg">ห้องน้ำสวน</td>
                <td className="p-2">
                  <CommonAreaCard
                    area="ห้องน้ำสวน"
                    time="เช้า"
                    data={commonAreas.find(a => a.id === "toilet-cafe-morning")}
                    nickname={nickname}
                    isFO={nickname === "FO"}
                  />
                </td>
                <td className="p-2">
                  <CommonAreaCard
                    area="ห้องน้ำสวน"
                    time="บ่าย"
                    data={commonAreas.find(a => a.id === "toilet-cafe-afternoon")}
                    nickname={nickname}
                    isFO={nickname === "FO"}
                  />
                </td>
              </tr>
              {/* ลิฟต์ */}
              <tr>
                <td className="p-2 font-medium text-base sm:text-lg">ลิฟต์</td>
                <td className="p-2">
                  <CommonAreaCard
                    area="ลิฟต์"
                    time="เช้า"
                    data={commonAreas.find(a => a.id === "lift-morning")}
                    nickname={nickname}
                    isFO={nickname === "FO"}
                  />
                </td>
                <td className="p-2">
                  <CommonAreaCard
                    area="ลิฟต์"
                    time="บ่าย"
                    data={commonAreas.find(a => a.id === "lift-afternoon")}
                    nickname={nickname}
                    isFO={nickname === "FO"}
                  />
                </td>
              </tr>
              {/* ห้องทานข้าว - บ่าย only */}
              <tr>
                <td className="p-2 font-medium text-base sm:text-lg">ห้องทานข้าว</td>
                <td className="p-2">—</td>
                <td className="p-2">
                  <CommonAreaCard
                    area="ห้องทานข้าว"
                    time="บ่าย"
                    data={commonAreas.find(a => a.id === "dining-room-afternoon")}
                    nickname={nickname}
                    isFO={nickname === "FO"}
                  />
                </td>
              </tr>
              {/* ห้องผ้าสต็อค - บ่าย only */}
              <tr>
                <td className="p-2 font-medium text-base sm:text-lg">ห้องผ้าสต็อค</td>
                <td className="p-2">—</td>
                <td className="p-2">
                  <CommonAreaCard
                    area="ห้องผ้าสต็อค"
                    time="บ่าย"
                    data={commonAreas.find(a => a.id === "linen-stock-afternoon")}
                    nickname={nickname}
                    isFO={nickname === "FO"}
                  />
                </td>
              </tr>
              {/* ทางเดินชั้น 1-6 - บ่าย only */}
              {[1, 2, 3, 4, 5, 6].map(floor => (
                <tr key={floor}>
                  <td className="p-2 font-medium text-base sm:text-lg">ทางเดินชั้น {floor}</td>
                  <td className="p-2">—</td>
                  <td className="p-2">
                    <CommonAreaCard
                      area={`ทางเดินชั้น ${floor}`}
                      time="บ่าย"
                      data={commonAreas.find(a => a.id === `hall-${floor}-afternoon`)}
                      nickname={nickname}
                      isFO={nickname === "FO"}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Color Legend */}
      <div className="mt-6 bg-white rounded-2xl p-4 shadow-md max-w-md mx-auto">
        <h3 className="font-semibold text-center text-[#15803D] mb-3">
          ความหมายของสีห้อง
        </h3>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded bg-green-200 flex-shrink-0"></div>
            <span>ทำห้องเสร็จแล้ว (ว่าง)</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded bg-cyan-200 flex-shrink-0"></div>
            <span>ทำห้องเสร็จแล้ว (พักต่อ)</span>
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
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded bg-purple-300 flex-shrink-0"></div>
            <span>ห้องไม่มีเข้าพัก 3 วันติด</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

