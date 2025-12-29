import React, { useState, useEffect, useRef } from "react";
import RoomCard from "./RoomCard";
import CommonAreaCard from "./CommonAreaCard";
import * as pdfjsLib from "pdfjs-dist";
import { db } from "../services/firebase";
import { collection, doc, getDoc, getDocs, setDoc, deleteDoc, onSnapshot, serverTimestamp } from "firebase/firestore";

// Configure PDF.js worker for Vite - use worker from node_modules to ensure version match
// Use jsDelivr CDN which is more reliable than unpkg/cdnjs for worker files
if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.449/build/pdf.worker.min.mjs';
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
  const [showUnoccupied3dModal, setShowUnoccupied3dModal] = useState(false); // Show popup for 3-day unoccupied rooms
  const [unoccupiedRoomsD0, setUnoccupiedRoomsD0] = useState([]); // Unoccupied rooms for today
  const [unoccupiedRoomsD1, setUnoccupiedRoomsD1] = useState([]); // Unoccupied rooms for 1 day ago
  const [unoccupiedRoomsD2, setUnoccupiedRoomsD2] = useState([]); // Unoccupied rooms for 2 days ago
  const unoccupied3dFileInputRef0 = useRef(null); // Ref for today PDF input
  const unoccupied3dFileInputRef1 = useRef(null); // Ref for 1 day ago PDF input
  const unoccupied3dFileInputRef2 = useRef(null); // Ref for 2 days ago PDF input
  
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
        lastUpdated: new Date().toISOString(),
        updatedBy: nickname || "unknown" // Track who made the update for debugging
      };
      
      // Remove all undefined values before sending to Firestore
      const cleanedPayload = removeUndefinedValues(payload);
      
      // Use setDoc with merge: true to preserve other document fields
      // The rooms array is always complete, so this will update it correctly
      await setDoc(roomsDoc, cleanedPayload, { merge: true });
      
      // Update localStorage for local persistence
      try {
        localStorage.setItem('crystal_rooms', JSON.stringify(updatedRooms));
      } catch (error) {
        console.error("Error saving to localStorage:", error);
      }
      
      console.log(`✅ Firestore updated immediately - real-time sync triggered (${migratedRooms.length} rooms, updated by: ${nickname || "unknown"})`);
    } catch (error) {
      console.error("Error updating Firestore:", error);
      // Re-throw error so caller knows update failed
      throw error;
    }
  };

  // Wrapper function for RoomCard to update a single room immediately (for real-time sync)
  const updateRoomImmediately = async (roomNumber, roomUpdates) => {
    // Use functional update to ensure we have the latest state
    const updatedRooms = await new Promise((resolve) => {
      setRooms(prevRooms => {
        const updated = prevRooms.map(r => {
          if (String(r.number) === String(roomNumber)) {
            const roomUpdate = { ...r, ...roomUpdates };
            // Track when room becomes vacant
            if (roomUpdate.status === "vacant" && r.status !== "vacant") {
              roomUpdate.vacantSince = new Date().toISOString();
            } else if (roomUpdate.status !== "vacant" && r.status === "vacant") {
              // Clear vacantSince when room becomes occupied (remove it, don't set to undefined)
              delete roomUpdate.vacantSince;
            } else if (roomUpdate.status === "vacant" && r.status === "vacant") {
              // Preserve vacantSince if room stays vacant
              roomUpdate.vacantSince = r.vacantSince || new Date().toISOString();
            }
            
            // Remove wasPurpleBeforeCleaned if room is no longer green/cyan
            if (roomUpdate.status !== "cleaned" && roomUpdate.status !== "cleaned_stay") {
              delete roomUpdate.wasPurpleBeforeCleaned;
            }
            
            return roomUpdate;
          }
          return r;
        });
        resolve(updated);
        return updated;
      });
    });
    
    // Update Firestore immediately for real-time sync
    // Wait for Firestore write to complete to ensure sync happens
    try {
      await updateFirestoreImmediately(updatedRooms);
      console.log(`✅ Room ${roomNumber} updated and synced to Firestore`);
    } catch (err) {
      console.error("Error updating room in Firestore:", err);
      // Still update local state even if Firestore fails
    }
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
    { number: "207", type: "D5", floor: 2, status: "vacant", maid: "", remark: "", cleanedToday: false },
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

  // Helper function to remove undefined values from objects (Firestore doesn't allow undefined)
  const removeUndefinedValues = (obj) => {
    if (obj === null || obj === undefined) {
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map(item => removeUndefinedValues(item));
    }
    if (typeof obj === 'object') {
      const cleaned = {};
      for (const key in obj) {
        if (obj[key] !== undefined) {
          cleaned[key] = removeUndefinedValues(obj[key]);
        }
      }
      return cleaned;
    }
    return obj;
  };

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
        // Remove vacantSince when room is not vacant (don't set to undefined)
        delete migrated.vacantSince;
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
    const unsubscribe = onSnapshot(roomsDoc, 
      (snapshot) => {
        // Skip during initial load to prevent double-loading
        if (isInitialLoad.current) {
          console.log("⏸️ Skipping real-time update during initial load");
          return;
        }
        
        // Skip during PDF upload to prevent overwriting bulk updates
        // But only skip if we're actually uploading (not just if flag was set)
        if (isUploadingPDF.current) {
          console.log("⏸️ Skipping real-time update during PDF upload");
          return;
        }
        
        if (snapshot.exists()) {
          const data = snapshot.data();
          
          if (data.rooms && Array.isArray(data.rooms)) {
            // Firestore is the source of truth - always accept updates
            const migratedRooms = migrateMovedOutToCheckedOut(data.rooms);
            
            // Always update state from Firestore to ensure real-time sync across all devices
            // Firestore is the source of truth - always accept its updates
            // Create a new array reference to ensure React detects the change and triggers re-render
            const updatedBy = data.updatedBy || "unknown";
            const lastUpdated = data.lastUpdated || "";
            
            console.log(`✅ Real-time sync: Received update from Firestore - ${migratedRooms.length} rooms (updated by: ${updatedBy}, timestamp: ${lastUpdated})`);
            
            // Always update state - Firestore is the source of truth
            // Use spread operator to create new array reference, ensuring React detects change
            setRooms([...migratedRooms]);
            
            // Update localStorage as read-only backup (don't use it to overwrite Firestore)
            try {
              localStorage.setItem('crystal_rooms', JSON.stringify(migratedRooms));
            } catch (error) {
              console.error("Error saving to localStorage:", error);
            }
            
            console.log(`✅ Real-time sync: State updated from Firestore - ${migratedRooms.length} rooms`);
          } else {
            console.warn("⚠️ Firestore data exists but rooms array is missing or invalid");
          }
        } else {
          console.warn("⚠️ Firestore document does not exist");
        }
      },
      (error) => {
        console.error("❌ Error listening to Firestore:", error);
        console.error("Error details:", {
          code: error.code,
          message: error.message
        });
        // DO NOT reset rooms on error - keep current state intact
        // The listener will automatically retry on reconnection
      }
    );

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
      let textItemsWithPosition = []; // Store text items with positions from ALL pages for column extraction
      let firstPage = null; // Store first page reference for viewport and date extraction
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(" ");
        allText += " " + pageText;
        
        // Store first page reference for viewport (all pages should have same width)
        if (i === 1) {
          firstPage = page;
        }
        
        // Store text items with positions from ALL pages for first column extraction
        const pageItems = textContent.items.map(item => ({
          str: item.str,
          x: item.transform ? item.transform[4] : 0,
          y: item.transform ? item.transform[5] : 0,
          pageNum: i, // Track which page this item is from
        }));
        textItemsWithPosition.push(...pageItems);
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

      // For in-house and departure PDFs, extract room numbers from first column of ALL pages
      let roomsToUpdate = validExistingRooms;
      if (type === "inhouse" || type === "departure") {
        // Extract room numbers from first column of all pages
        try {
          const viewport = firstPage.getViewport({ scale: 1.0 });
          const pageWidth = viewport.width;
          const firstColumnMaxX = pageWidth * 0.3;
          
          // Filter items from first column (left 30% of page) and exclude header area
          // Group by page and row to extract first column room from each row
          const firstColumnItems = textItemsWithPosition.filter(item => 
            item.x < firstColumnMaxX && item.y < 700 // Below header area
          );
          
          // Group by page number and row (Y position)
          const pageRows = {};
          firstColumnItems.forEach(item => {
            const pageKey = item.pageNum;
            const rowKey = Math.round(item.y / 5) * 5; // Group by Y position with tolerance
            const key = `${pageKey}_${rowKey}`;
            if (!pageRows[key]) pageRows[key] = [];
            pageRows[key].push(item);
          });
          
          const firstColumnRooms = [];
          const roomNumberPattern = /^\d{3}$/;
          
          // Sort by page number, then by row (top to bottom), then extract leftmost room number
          Object.keys(pageRows)
            .sort((a, b) => {
              const [pageA, rowA] = a.split('_').map(Number);
              const [pageB, rowB] = b.split('_').map(Number);
              if (pageA !== pageB) return pageA - pageB; // Page order
              return rowB - rowA; // Top to bottom within page
            })
            .forEach(key => {
              const rowItems = pageRows[key].sort((a, b) => a.x - b.x); // Left to right
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
          
          if (firstColumnRooms.length > 0) {
            roomsToUpdate = firstColumnRooms;
            console.log(`📋 Extracted ${firstColumnRooms.length} rooms from first column (all pages):`, firstColumnRooms);
          } else {
            console.log("⚠️ Could not extract first column rooms, using all valid rooms");
          }
        } catch (error) {
          console.error("Error extracting first column rooms:", error);
          console.log("⚠️ Using all valid rooms as fallback");
        }
      }

      // Update only rooms found in PDF (or first column for in-house) - set status based on report type
      // In-House PDF = blue (stay_clean)
      // Expected Departure PDF = yellow (will_depart_today)
      // After Expected Departure PDF upload, ALWAYS assign gray-200 (long_stay) to long-stay rooms: 503, 608, 609
      // Calculate updated rooms first, then update state
      const longStayRooms = ["503", "608", "609"];
      const updatedRooms = rooms.map(r => {
        // Convert to string for comparison
        const roomNumStr = String(r.number);
        const isInPDF = roomsToUpdate.some(pdfRoom => String(pdfRoom) === roomNumStr);
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
            // Clear vacantSince when room becomes occupied (remove it, don't set to undefined)
            console.log(`Updating room ${r.number} to stay_clean (blue)`);
            const updated = { ...r, status: "stay_clean", cleanedToday: false, border: r.border || "black" };
            delete updated.vacantSince; // Remove vacantSince instead of setting to undefined
            return updated;
          }
          if (type === "departure") {
            // Expected Departure PDF: set to yellow (will_depart_today)
            // Preserve border (keep existing or default to black)
            // Skip if it's a long-stay room (already handled above - they become gray-200/long_stay)
            // Clear vacantSince when room becomes occupied (remove it, don't set to undefined)
            if (!isLongStay) {
              console.log(`Updating room ${r.number} to will_depart_today (yellow)`);
              const updated = { ...r, status: "will_depart_today", cleanedToday: false, border: r.border || "black" };
              delete updated.vacantSince; // Remove vacantSince instead of setting to undefined
              return updated;
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
        const isInPDF = roomsToUpdate.some(pdfRoom => String(pdfRoom) === roomNumStr);
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
        setDepartureRoomCount(roomsToUpdate.length);
        // Save to Firestore
        await setDoc(doc(db, "reports", "counts"), {
          departureRoomCount: roomsToUpdate.length,
        }, { merge: true });
      } else if (type === "inhouse") {
        setInhouseRoomCount(roomsToUpdate.length);
        // Save to Firestore
        await setDoc(doc(db, "reports", "counts"), {
          inhouseRoomCount: roomsToUpdate.length,
        }, { merge: true });
        
        // Extract date from PDF and store room numbers in date-named array
        try {
          // Find "Date" text and extract date from right side (top right area)
          let extractedDate = null;
          
          // Find items in top right area of first page only (date is usually on first page)
          const firstPageItems = textItemsWithPosition.filter(item => item.pageNum === 1);
          const topRightItems = firstPageItems
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
          
          // Store roomsToUpdate (first column rooms) in Firestore with date-based key
          const arrayKey = `occupied_rooms_${extractedDate}`;
          await setDoc(doc(db, "reports", arrayKey), {
            rooms: roomsToUpdate, // Store the rooms from first column that were updated
            date: extractedDate,
            uploadedAt: new Date().toISOString(),
          }, { merge: true });
          
          console.log(`✅ Stored ${roomsToUpdate.length} rooms in ${arrayKey}:`, roomsToUpdate);
          
          // Also store unoccupied_rooms_DD_MM_YYYY = all rooms - extracted rooms
          const allRoomNumbers = rooms.map(r => String(r.number));
          const unoccupiedRooms = allRoomNumbers.filter(roomNum => !roomsToUpdate.includes(roomNum));
          const unoccupiedArrayKey = `unoccupied_rooms_${extractedDate}`;
          await setDoc(doc(db, "reports", unoccupiedArrayKey), {
            rooms: unoccupiedRooms, // Store the rooms NOT in the PDF
            date: extractedDate,
            uploadedAt: new Date().toISOString(),
          }, { merge: true });
          
          console.log(`✅ Stored ${unoccupiedRooms.length} unoccupied rooms in ${unoccupiedArrayKey}:`, unoccupiedRooms);
        } catch (error) {
          console.error("Error storing occupied rooms:", error);
        }
      }

      // Write to Firestore immediately for real-time sync
      await updateFirestoreImmediately(updatedRooms);
        console.log(`✅ PDF upload synced to Firestore - ${roomsToUpdate.length} rooms updated`);

      // Show success toast with count
      const statusText = type === "departure" ? "จะออกวันนี้" : "พักต่อ";
      alert(`${roomsToUpdate.length} ห้องถูกอัปเดตเป็นสถานะ ${statusText}`);
      
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

  // Handler for uploading in-house PDFs in the 3-day unoccupied popup
  const handleUnoccupied3dPDFUpload = async (dayIndex, file) => {
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
    
    try {
      console.log(`Starting unoccupied 3d PDF upload: day ${dayIndex}`);
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      let allText = "";
      let textItemsWithPosition = [];
      let firstPage = null;
      
      // Extract text from all pages
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(" ");
        allText += " " + pageText;
        
        if (i === 1) {
          firstPage = page;
        }
        
        const pageItems = textContent.items.map(item => ({
          str: item.str,
          x: item.transform ? item.transform[4] : 0,
          y: item.transform ? item.transform[5] : 0,
          pageNum: i,
        }));
        textItemsWithPosition.push(...pageItems);
      }

      // Get all valid room numbers
      const roomMatches = allText.match(/\b\d{3}\b/g) || [];
      const validRoomNumbers = roomMatches
        .filter(num => {
          const firstDigit = parseInt(num[0]);
          return firstDigit >= 1 && firstDigit <= 6;
        })
        .filter((num, idx, arr) => arr.indexOf(num) === idx);

      // Get existing room numbers from rooms state
      const validExistingRooms = rooms.map(r => String(r.number));
      
      // Extract room numbers from first column of all pages
      let roomsToUpdate = [];
      if (firstPage && textItemsWithPosition.length > 0) {
        try {
          const viewport = firstPage.getViewport({ scale: 1.0 });
          const pageWidth = viewport.width;
          const firstColumnMaxX = pageWidth * 0.3;
          
          const firstColumnItems = textItemsWithPosition.filter(item => 
            item.x < firstColumnMaxX && item.y < 700
          );
          
          const pageRows = {};
          firstColumnItems.forEach(item => {
            const pageKey = item.pageNum;
            const rowKey = Math.round(item.y / 5) * 5;
            const key = `${pageKey}_${rowKey}`;
            if (!pageRows[key]) pageRows[key] = [];
            pageRows[key].push(item);
          });
          
          const firstColumnRooms = [];
          const roomNumberPattern = /^\d{3}$/;
          
          Object.keys(pageRows)
            .sort((a, b) => {
              const [pageA, rowA] = a.split('_').map(Number);
              const [pageB, rowB] = b.split('_').map(Number);
              if (pageA !== pageB) return pageA - pageB;
              return rowB - rowA;
            })
            .forEach(key => {
              const rowItems = pageRows[key].sort((a, b) => a.x - b.x);
              for (const item of rowItems) {
                if (roomNumberPattern.test(item.str)) {
                  const roomNum = item.str;
                  if (validExistingRooms.includes(roomNum) && !firstColumnRooms.includes(roomNum)) {
                    firstColumnRooms.push(roomNum);
                    break;
                  }
                }
              }
            });
          
          if (firstColumnRooms.length > 0) {
            roomsToUpdate = firstColumnRooms;
            console.log(`📋 Extracted ${firstColumnRooms.length} rooms from first column (all pages):`, firstColumnRooms);
          }
        } catch (error) {
          console.error("Error extracting first column rooms:", error);
        }
      }
      
      // Calculate unoccupied_rooms_d_X = all rooms - extracted rooms
      const allRoomNumbers = rooms.map(r => String(r.number));
      const unoccupiedRooms = allRoomNumbers.filter(roomNum => !roomsToUpdate.includes(roomNum));
      
      // Store in appropriate state
      if (dayIndex === 0) {
        setUnoccupiedRoomsD0(unoccupiedRooms);
        console.log(`✅ Stored unoccupied_rooms_d_0: ${unoccupiedRooms.length} rooms`);
        alert(`อัปเดตสำเร็จ: พบ ${unoccupiedRooms.length} ห้องที่ไม่เข้าพัก (วันนี้)`);
      } else if (dayIndex === 1) {
        setUnoccupiedRoomsD1(unoccupiedRooms);
        console.log(`✅ Stored unoccupied_rooms_d_1: ${unoccupiedRooms.length} rooms`);
        alert(`อัปเดตสำเร็จ: พบ ${unoccupiedRooms.length} ห้องที่ไม่เข้าพัก (1 วันก่อน)`);
      } else if (dayIndex === 2) {
        setUnoccupiedRoomsD2(unoccupiedRooms);
        console.log(`✅ Stored unoccupied_rooms_d_2: ${unoccupiedRooms.length} rooms`);
        alert(`อัปเดตสำเร็จ: พบ ${unoccupiedRooms.length} ห้องที่ไม่เข้าพัก (2 วันก่อน)`);
      }
      
      // Reset file input
      if (dayIndex === 0 && unoccupied3dFileInputRef0.current) {
        unoccupied3dFileInputRef0.current.value = "";
      } else if (dayIndex === 1 && unoccupied3dFileInputRef1.current) {
        unoccupied3dFileInputRef1.current.value = "";
      } else if (dayIndex === 2 && unoccupied3dFileInputRef2.current) {
        unoccupied3dFileInputRef2.current.value = "";
      }
    } catch (error) {
      console.error("Error processing unoccupied 3d PDF:", error);
      alert(`เกิดข้อผิดพลาดในการประมวลผล PDF: ${error.message}`);
    }
  };

  // Handler for calculating intersection and updating rooms to purple
  const handleCalculateUnoccupied3d = async () => {
    try {
      // Compute intersection: unoccupied_rooms_3d = intersection(unoccupied_rooms_d_0, unoccupied_rooms_d_1, unoccupied_rooms_d_2)
      const unoccupied3d = unoccupiedRoomsD0.filter(roomNum => 
        unoccupiedRoomsD1.includes(roomNum) && unoccupiedRoomsD2.includes(roomNum)
      );
      
      console.log(`📊 Computing intersection:`);
      console.log(`   D0 (today): ${unoccupiedRoomsD0.length} rooms`);
      console.log(`   D1 (1 day ago): ${unoccupiedRoomsD1.length} rooms`);
      console.log(`   D2 (2 days ago): ${unoccupiedRoomsD2.length} rooms`);
      console.log(`   Intersection: ${unoccupied3d.length} rooms`);
      
      // Change room status of unoccupied_rooms_3d to purple (unoccupied_3d)
      const updatedRooms = rooms.map(r => {
        const roomNumStr = String(r.number);
        if (unoccupied3d.includes(roomNumStr)) {
          return { ...r, status: "unoccupied_3d" };
        }
        return r;
      });
      
      // Update state
      setRooms(updatedRooms);
      setUnoccupiedRooms3d(new Set(unoccupied3d));
      
      // Save to Firestore immediately for real-time sync
      await updateFirestoreImmediately(updatedRooms);
      console.log(`✅ Updated ${unoccupied3d.length} rooms to unoccupied_3d status and synced to Firestore`);
      
      // Delete all arrays whose name starts with unoccupied_rooms
      const reportsCollection = collection(db, "reports");
      const allReportsSnapshot = await getDocs(reportsCollection);
      const deletePromises = [];
      
      allReportsSnapshot.docs.forEach(docSnap => {
        const docId = docSnap.id;
        if (docId.startsWith("unoccupied_rooms_")) {
          deletePromises.push(deleteDoc(doc(db, "reports", docId)));
          console.log(`🗑️ Deleting ${docId}`);
        }
      });
      
      await Promise.all(deletePromises);
      console.log(`✅ Deleted ${deletePromises.length} unoccupied_rooms_ arrays`);
      
      alert(`อัปเดต ${unoccupied3d.length} ห้องเป็นสีม่วง (ไม่มีเข้าพัก 3 วันติด) และลบข้อมูล unoccupied_rooms_ ทั้งหมดแล้ว`);
      
      // Close modal and reset state
      setShowUnoccupied3dModal(false);
      setUnoccupiedRoomsD0([]);
      setUnoccupiedRoomsD1([]);
      setUnoccupiedRoomsD2([]);
    } catch (error) {
      console.error("Error calculating unoccupied 3d rooms:", error);
      alert("เกิดข้อผิดพลาดในการคำนวณห้องที่ว่าง: " + error.message);
    }
  };

  // Show all rooms, but mark unoccupied ones for purple highlighting
  const filteredRooms = rooms;

  const floors = [6,5,4,3,2,1].map(f =>
    filteredRooms.filter(r => r.floor === f)
  );

  // Calculate maid scores dynamically
  // If changing from any color (except purple) to green/cyan: Deluxe = 1pt, Suite = 2pts
  // If changing from purple to green/cyan: Deluxe = 0.5pt, Suite = 1pt
  // Track by nickname (maid field) when status is "cleaned" or "cleaned_stay"
  const calculateMaidScores = () => {
    const scores = {};
    rooms.forEach(room => {
      // Only score green/cyan rooms (not purple rooms)
      if ((room.status === "cleaned" || room.status === "cleaned_stay") && room.maid) {
        const nickname = room.maid.trim();
        if (nickname) {
          const isSuite = room.type?.toUpperCase().startsWith("S");
          let points = 0;
          
          // Check if room was purple before being cleaned
          if (room.wasPurpleBeforeCleaned === true) {
            // Changed from purple to green/cyan: Deluxe = 0.5pt, Suite = 1pt
            points = isSuite ? 1 : 0.5;
          } else {
            // Changed from any other color to green/cyan: Deluxe = 1pt, Suite = 2pts
            points = isSuite ? 2 : 1;
          }
          
          if (points > 0) {
            scores[nickname] = (scores[nickname] || 0) + points;
          }
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
      // "ลบข้อมูล" logic:
      // - Delete nickname/username below room type (maid field)
      // - Change red border to black border
      // - Change color to white (vacant)
      // - Delete nicknames/usernames on every room card regardless of status
      // - Do NOT delete remark box info
      const clearedRooms = rooms.map(r => {
        return {
          ...r,
          status: "vacant", // ALL rooms become white (vacant)
          maid: "", // Clear maid nickname/username below room type
          lastEditor: "", // Clear lastEditor
          selectedBy: "", // Clear selectedBy
          cleanedBy: "", // Clear cleanedBy
          cleanedToday: false,
          border: "black", // Change red border to black border (all borders become black)
          remark: r.remark || "", // Preserve remark - do NOT delete remark box info
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
          // "ลบข้อมูล" logic for common areas:
          // - Delete maid's nickname
          // - Change green background to red (status: "waiting" shows red)
          // - Change border to black
          const updateData = {
            status: "waiting", // Change green background to red (waiting = red background)
            maid: "", // Delete maid's nickname
            border: "black", // Change border to black
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

      {/* Modal for 3-day unoccupied rooms */}
      {showUnoccupied3dModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl shadow-lg max-h-[90vh] overflow-y-auto">
            <h2 className="font-semibold text-xl mb-6 text-center text-purple-600">
              หาห้องที่ไม่เข้าพัก 3 วันติด
            </h2>
            
            <div className="space-y-4 mb-6">
              {/* Today PDF Upload */}
              <div className="border-2 border-gray-300 rounded-lg p-4">
                <label className="block text-sm font-semibold mb-2 text-gray-700">
                  อัปโหลด In-House PDF (วันนี้)
                </label>
                <input 
                  ref={unoccupied3dFileInputRef0}
                  type="file" 
                  accept=".pdf"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) {
                      handleUnoccupied3dPDFUpload(0, file);
                    }
                  }}
                />
                <button
                  onClick={() => unoccupied3dFileInputRef0.current?.click()}
                  className="w-full px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-base font-semibold"
                >
                  {unoccupiedRoomsD0.length > 0 ? `✓ อัปโหลดแล้ว (${unoccupiedRoomsD0.length} ห้อง)` : "เลือกไฟล์ PDF"}
                </button>
              </div>

              {/* 1 Day Ago PDF Upload */}
              <div className="border-2 border-gray-300 rounded-lg p-4">
                <label className="block text-sm font-semibold mb-2 text-gray-700">
                  อัปโหลด In-House PDF (1 วันก่อน)
                </label>
                <input 
                  ref={unoccupied3dFileInputRef1}
                  type="file" 
                  accept=".pdf"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) {
                      handleUnoccupied3dPDFUpload(1, file);
                    }
                  }}
                />
                <button
                  onClick={() => unoccupied3dFileInputRef1.current?.click()}
                  className="w-full px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-base font-semibold"
                >
                  {unoccupiedRoomsD1.length > 0 ? `✓ อัปโหลดแล้ว (${unoccupiedRoomsD1.length} ห้อง)` : "เลือกไฟล์ PDF"}
                </button>
              </div>

              {/* 2 Days Ago PDF Upload */}
              <div className="border-2 border-gray-300 rounded-lg p-4">
                <label className="block text-sm font-semibold mb-2 text-gray-700">
                  อัปโหลด In-House PDF (2 วันก่อน)
                </label>
                <input 
                  ref={unoccupied3dFileInputRef2}
                  type="file" 
                  accept=".pdf"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) {
                      handleUnoccupied3dPDFUpload(2, file);
                    }
                  }}
                />
                <button
                  onClick={() => unoccupied3dFileInputRef2.current?.click()}
                  className="w-full px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-base font-semibold"
                >
                  {unoccupiedRoomsD2.length > 0 ? `✓ อัปโหลดแล้ว (${unoccupiedRoomsD2.length} ห้อง)` : "เลือกไฟล์ PDF"}
                </button>
              </div>
            </div>

            {/* Calculate Button */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowUnoccupied3dModal(false);
                  setUnoccupiedRoomsD0([]);
                  setUnoccupiedRoomsD1([]);
                  setUnoccupiedRoomsD2([]);
                }}
                className="flex-1 px-4 py-3 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors text-base font-semibold"
              >
                ปิด
              </button>
              <button
                onClick={handleCalculateUnoccupied3d}
                disabled={unoccupiedRoomsD0.length === 0 || unoccupiedRoomsD1.length === 0 || unoccupiedRoomsD2.length === 0}
                className={`flex-1 px-4 py-3 rounded-lg transition-colors text-base font-semibold ${
                  unoccupiedRoomsD0.length > 0 && unoccupiedRoomsD1.length > 0 && unoccupiedRoomsD2.length > 0
                    ? "bg-purple-600 text-white hover:bg-purple-700"
                    : "bg-gray-400 text-gray-200 cursor-not-allowed"
                }`}
              >
                หาห้องที่ไม่เข้าพัก 3วันติด
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
        {nickname === "FO" && (
          <button
            onClick={() => {
              if (!isLoggedIn || nickname !== "FO") {
                setShowLoginModal(true);
                return;
              }
              setShowUnoccupied3dModal(true);
            }}
            className="px-4 py-2 rounded-lg shadow-md transition-colors inline-block select-none bg-purple-500 text-white hover:bg-purple-600"
          >
            {/* Button label in Thai */}
            0. แสดงห้องไม่เข้าพัก 3 วันติด
          </button>
        )}
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
                {roomsOnFloor.map(r => (
                  <RoomCard 
                    key={r.number} 
                    room={r} 
                    updateRoomImmediately={updateRoomImmediately}
                    isLoggedIn={isLoggedIn}
                    onLoginRequired={() => setShowLoginModal(true)}
                    currentNickname={nickname}
                    currentDate={remarkDateString}
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
            <th className="text-right">คะแนน</th>
          </tr></thead>
          <tbody>
            {maidEntries.length > 0 ? (
              maidEntries.map(([maid, score]) => (
                <tr key={maid}>
                  <td>{maid}</td>
                  <td className="text-right">{score % 1 === 0 ? score : score.toFixed(1)}</td>
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
              {/* ทางเดินชั้น 1 - เช้า and บ่าย */}
              <tr>
                <td className="p-2 font-medium text-base sm:text-lg">ทางเดินชั้น 1</td>
                <td className="p-2">
                  <CommonAreaCard
                    area="ทางเดินชั้น 1"
                    time="เช้า"
                    data={commonAreas.find(a => a.id === "hall-1-morning")}
                    nickname={nickname}
                    isFO={nickname === "FO"}
                  />
                </td>
                <td className="p-2">
                  <CommonAreaCard
                    area="ทางเดินชั้น 1"
                    time="บ่าย"
                    data={commonAreas.find(a => a.id === "hall-1-afternoon")}
                    nickname={nickname}
                    isFO={nickname === "FO"}
                  />
                </td>
              </tr>
              {/* ทางเดินชั้น 2-6 - บ่าย only */}
              {[2, 3, 4, 5, 6].map(floor => (
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

