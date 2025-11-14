import React, { useState, useEffect } from "react";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../services/firebase";
import { motion, AnimatePresence } from "framer-motion";

const CommonAreaCard = ({ area, time, data, nickname, isFO }) => {
  const [showPopup, setShowPopup] = useState(false);
  const [border, setBorder] = useState(data?.border || "black");

  const status = data?.status || "waiting";
  const maid = data?.maid || "";
  const isCleaned = status === "cleaned";

  // Sync border from data when it changes
  useEffect(() => {
    if (data?.border) {
      setBorder(data.border);
    } else {
      setBorder("black");
    }
  }, [data?.border]);

  // Generate document ID based on area and time
  const getDocId = () => {
    const areaMap = {
      "ล็อบบี้": "lobby",
      "ห้องน้ำสวน": "toilet-cafe",
      "ลิฟต์": "lift",
      "ห้องทานข้าว": "dining-room",
      "ห้องผ้าสต็อค": "linen-stock",
    };
    
    // Handle hallways
    if (area.startsWith("ทางเดินชั้น")) {
      const floor = area.replace("ทางเดินชั้น ", "").trim();
      const timeKey = time === "เช้า" ? "morning" : "afternoon";
      return `hall-${floor}-${timeKey}`;
    }
    
    const areaKey = areaMap[area] || area.toLowerCase().replace(/\s+/g, "-");
    const timeKey = time === "เช้า" ? "morning" : "afternoon";
    return `${areaKey}-${timeKey}`;
  };

  const buttonColor = isCleaned
    ? "bg-green-200 text-black"
    : "bg-red-300 text-black";

  const buttonText = isCleaned ? "สะอาดแล้ว" : "รอทำ";
  const borderClass = border === "red" ? "border-2 border-red-600" : "border border-black";
  const isDisabled = isFO || !nickname || !nickname.trim();

  // --- Firestore save ---
  const saveArea = async (update) => {
    const firestoreDocId = getDocId();
    console.log("💾 Saving area:", { firestoreDocId, area, time, update });
    try {
      await setDoc(
        doc(db, "commonAreas", firestoreDocId),
        {
          area,
          time,
          ...update,
        },
        { merge: true }
      );
      console.log("✅ Successfully saved to Firestore");
    } catch (error) {
      console.error("❌ Firestore save error:", error);
      throw error;
    }
  };

  // --- Maid actions ---
  const handleMarkCleaned = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isDisabled || !nickname || !nickname.trim()) {
      console.error("Cannot mark cleaned: disabled or no nickname");
      return;
    }
    try {
      await saveArea({
        status: "cleaned",
        maid: nickname.trim(),
        border: "black",
      });
      setBorder("black");
      setShowPopup(false);
      console.log("✅ Area marked as cleaned");
    } catch (error) {
      console.error("Error marking area as cleaned:", error);
      alert("เกิดข้อผิดพลาด: " + error.message);
    }
  };

  const handleSelectArea = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isDisabled || !nickname || !nickname.trim()) {
      console.error("Cannot select area: disabled or no nickname");
      return;
    }
    try {
      const newBorder = border === "red" ? "black" : "red";
      await saveArea({
        border: newBorder,
        maid: nickname.trim(),
        status: status, // Preserve current status
      });
      setBorder(newBorder);
      console.log("✅ Area border toggled");
    } catch (error) {
      console.error("Error toggling area border:", error);
      alert("เกิดข้อผิดพลาด: " + error.message);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isDisabled || !nickname || !nickname.trim()) {
      console.error("Cannot save: disabled or no nickname");
      return;
    }
    try {
      await saveArea({
        status: status,
        maid: maid || nickname.trim(),
        border: border,
      });
      setShowPopup(false);
      console.log("✅ Area saved");
    } catch (error) {
      console.error("Error saving area:", error);
      alert("เกิดข้อผิดพลาด: " + error.message);
    }
  };

  return (
    <div className="relative">
      {/* Main area button */}
      <div className={`${borderClass} rounded-lg overflow-hidden`}>
        <button
          disabled={isDisabled}
          onClick={() => !isDisabled && setShowPopup(true)}
          className={`w-full py-3 px-3 rounded-lg text-base sm:text-lg font-semibold ${buttonColor} transition-all ${
            isDisabled 
              ? "opacity-50 cursor-not-allowed" 
              : "cursor-pointer hover:opacity-90 active:scale-95"
          }`}
        >
          {buttonText}
          {isCleaned && maid && (
            <div className="text-sm mt-1 font-normal">โดย: {maid}</div>
          )}
        </button>
      </div>

      {/* Popup */}
      <AnimatePresence>
        {showPopup && !isFO && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setShowPopup(false);
              }
            }}
          >
            <motion.div
              className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl"
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <h2 className="text-xl font-bold mb-4 text-center text-[#15803D]">
                {area} ({time})
              </h2>

              {/* Big green button */}
              <button
                type="button"
                className="w-full bg-green-200 hover:bg-green-300 text-black py-4 rounded-lg mb-4 text-lg font-semibold transition-colors"
                onClick={handleMarkCleaned}
              >
                สะอาดแล้ว
              </button>

              {/* Bottom buttons */}
              <div className="flex justify-between items-center">
                <button
                  type="button"
                  onClick={handleSelectArea}
                  className={`px-4 py-2 rounded-lg text-base font-semibold transition-colors ${
                    border === "red"
                      ? "bg-red-600 text-white hover:bg-red-700"
                      : "bg-[#15803D] text-white hover:bg-[#166534]"
                  }`}
                >
                  เลือกพื้นที่นี้
                </button>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowPopup(false);
                    }}
                    className="bg-gray-300 text-black px-4 py-2 rounded-lg text-base font-semibold hover:bg-gray-400 transition-colors"
                  >
                    ปิด
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    className="bg-[#15803D] text-white px-4 py-2 rounded-lg text-base font-semibold hover:bg-[#166534] transition-colors"
                  >
                    บันทึก
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CommonAreaCard;
