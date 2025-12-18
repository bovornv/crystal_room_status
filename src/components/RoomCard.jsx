import React, { useState, useEffect } from "react";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../services/firebase";
import { motion, AnimatePresence } from "framer-motion";

const RoomCard = ({ room, updateRoomImmediately, isLoggedIn, onLoginRequired, currentNickname, currentDate }) => {
  const [showPopup, setShowPopup] = useState(false);
  const [remark, setRemark] = useState(room.remark || "");

  // Sync remark when room prop changes
  useEffect(() => {
    setRemark(room.remark || "");
  }, [room.remark]);

  const colorMap = {
    cleaned: "bg-green-200", // ห้องเสร็จแล้ว (ว่าง)
    cleaned_stay: "bg-cyan-200", // ห้องเสร็จแล้ว (พักต่อ)
    closed: "bg-gray-500 text-white", // ปิดห้อง
    checked_out: "bg-red-300", // ออกแล้ว
    vacant: "bg-white", // ว่าง
    stay_clean: "bg-blue-200", // พักต่อ
    will_depart_today: "bg-yellow-200", // จะออกวันนี้
    long_stay: "bg-gray-200", // รายเดือน
    unoccupied_3d: "bg-purple-300", // ห้องไม่มีเข้าพัก 3 วันติด
  };

  const isFO = currentNickname === "FO";
  // Use status-based color, purple for unoccupied_3d status
  const roomBg = colorMap[room.status] || "bg-white";
  const borderColor = room.border === "red" ? "border-2 border-red-600" : "border border-black";

  const handleStatusChange = async (status) => {
    if (!isLoggedIn || !currentNickname) {
      onLoginRequired();
      return;
    }

    const wasCleaned = (status === "cleaned" || status === "cleaned_stay") && 
                        room.status !== "cleaned" && room.status !== "cleaned_stay";
    
    // Track if room was purple before being cleaned (for scoring purposes)
    const wasPurpleBeforeCleaned = wasCleaned && room.status === "unoccupied_3d";
    
    const roomUpdates = {
      status,
      border: "black",
      maid: isFO ? (room.maid || "") : ((status === "cleaned" || status === "cleaned_stay") ? currentNickname.trim() : (room.maid || "")),
      cleanedToday: wasCleaned ? true : (room.cleanedToday || false),
    };
    
    // Only add wasPurpleBeforeCleaned if it's true (for scoring)
    // If false or not applicable, don't include it (will be removed from existing rooms)
    if (wasPurpleBeforeCleaned) {
      roomUpdates.wasPurpleBeforeCleaned = true;
    }

    if (updateRoomImmediately) {
      await updateRoomImmediately(room.number, roomUpdates);
    }
  };

  const handleSelectRoom = async () => {
    if (!isLoggedIn || !currentNickname || isFO) {
      if (!isLoggedIn) onLoginRequired();
      return;
    }

    // Action 6: When "เลือกห้องนี้" is pressed:
    // - Change border from black to red (or red to black if already red)
    // - Show maid nickname below room type
    // - Everyone will see the change immediately via real-time sync
    const newBorder = room.border === "red" ? "black" : "red";
    const roomUpdates = {
      border: newBorder,
      maid: currentNickname.trim(), // Show nickname below room type
    };

    if (updateRoomImmediately) {
      await updateRoomImmediately(room.number, roomUpdates);
    }
  };

  const handleSaveRemark = async () => {
    if (!isLoggedIn || !currentNickname) {
      onLoginRequired();
      return;
    }

    const roomUpdates = {
      remark,
    };

    if (updateRoomImmediately) {
      await updateRoomImmediately(room.number, roomUpdates);
    }
    
    setShowPopup(false);
  };

  return (
    <div
      onClick={() => setShowPopup(true)}
      className={`rounded-lg p-2 ${roomBg} ${borderColor} cursor-pointer transition min-w-[80px]`}
    >
      <div className="flex flex-col items-start">
        <div className="flex justify-between items-start w-full">
          <div>
            <p className="font-bold text-lg sm:text-xl">{room.number}</p>
            <p className="text-xs sm:text-sm text-gray-700">{room.type}</p>
            {room.maid && (
              <p className="text-base sm:text-lg font-semibold text-gray-800 mt-1 block">{room.maid}</p>
            )}
          </div>
          {room.remark && (
            <div className="h-3 w-3 sm:h-4 sm:w-4 rounded-full bg-red-500 mt-1 flex-shrink-0"></div>
          )}
        </div>
      </div>

      {/* Popup */}
      <AnimatePresence>
        {showPopup && (
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
              <h2 className="text-2xl sm:text-3xl font-bold mb-6 text-center text-[#15803D]">
                ห้อง {room.number}
              </h2>

              {/* Non-FO user */}
              {!isFO && (
                <>
                  {/* Show only one button based on room color */}
                  {/* If room is NOT blue (stay_clean) and NOT light gray (long_stay), show green button */}
                  {room.status !== "stay_clean" && room.status !== "long_stay" && (
                    <div className="flex justify-center mb-4">
                      <button
                        className="w-full bg-green-200 hover:bg-green-300 text-black py-6 rounded-lg text-xl sm:text-2xl font-bold transition-colors"
                        onClick={() => handleStatusChange("cleaned")}
                      >
                        ห้องเสร็จแล้ว (ว่าง)
                      </button>
                    </div>
                  )}
                  {/* If room IS blue or light gray, show cyan button */}
                  {(room.status === "stay_clean" || room.status === "long_stay") && (
                    <div className="flex justify-center mb-4">
                      <button
                        className="w-full bg-cyan-200 hover:bg-cyan-300 text-black py-6 rounded-lg text-xl sm:text-2xl font-bold transition-colors"
                        onClick={() => handleStatusChange("cleaned_stay")}
                      >
                        ห้องเสร็จแล้ว (พักต่อ)
                      </button>
                    </div>
                  )}
                  <div className="flex justify-between items-center mb-3">
                    <button
                      onClick={handleSelectRoom}
                      className={`px-6 py-3 rounded-lg text-lg sm:text-xl font-semibold transition-colors ${
                        room.border === "red" 
                          ? "bg-[#15803D] text-white hover:bg-[#166534]" 
                          : "bg-green-200 text-black hover:bg-green-300"
                      }`}
                    >
                      เลือกห้องนี้
                    </button>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowPopup(false)}
                        className="bg-gray-300 text-black px-6 py-3 rounded-lg text-lg sm:text-xl font-semibold hover:bg-gray-400 transition-colors"
                      >
                        ปิด
                      </button>
                      <button
                        onClick={handleSaveRemark}
                        className="bg-[#15803D] text-white px-6 py-3 rounded-lg text-lg sm:text-xl font-semibold hover:bg-[#166534] transition-colors"
                      >
                        บันทึก
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* FO user */}
              {isFO && (
                <>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <button
                      onClick={() => handleStatusChange("cleaned")}
                      className="bg-green-200 py-4 rounded-lg text-black text-xl sm:text-2xl font-bold hover:bg-green-300 transition-colors"
                    >
                      ห้องเสร็จแล้ว (ว่าง)
                    </button>
                    <button
                      onClick={() => handleStatusChange("cleaned_stay")}
                      className="bg-cyan-200 py-4 rounded-lg text-black text-xl sm:text-2xl font-bold hover:bg-cyan-300 transition-colors"
                    >
                      ห้องเสร็จแล้ว (พักต่อ)
                    </button>
                    <button
                      onClick={() => handleStatusChange("closed")}
                      className="bg-gray-500 text-white py-4 rounded-lg text-xl sm:text-2xl font-bold hover:bg-gray-600 transition-colors"
                    >
                      ปิดห้อง
                    </button>
                    <button
                      onClick={() => handleStatusChange("checked_out")}
                      className="bg-red-300 py-4 rounded-lg text-black text-xl sm:text-2xl font-bold hover:bg-red-400 transition-colors"
                    >
                      ออกแล้ว
                    </button>
                    <button
                      onClick={() => handleStatusChange("vacant")}
                      className="bg-white border-2 border-gray-300 py-4 rounded-lg text-black text-xl sm:text-2xl font-bold hover:bg-gray-50 transition-colors"
                    >
                      ว่าง
                    </button>
                    <button
                      onClick={() => handleStatusChange("stay_clean")}
                      className="bg-blue-200 py-4 rounded-lg text-black text-xl sm:text-2xl font-bold hover:bg-blue-300 transition-colors"
                    >
                      พักต่อ
                    </button>
                    <button
                      onClick={() => handleStatusChange("will_depart_today")}
                      className="bg-yellow-200 py-4 rounded-lg text-black text-xl sm:text-2xl font-bold hover:bg-yellow-300 transition-colors"
                    >
                      จะออกวันนี้
                    </button>
                    <button
                      onClick={() => handleStatusChange("long_stay")}
                      className="bg-gray-200 py-4 rounded-lg text-black text-xl sm:text-2xl font-bold hover:bg-gray-300 transition-colors"
                    >
                      รายเดือน
                    </button>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setShowPopup(false)}
                      className="bg-gray-300 text-black px-6 py-3 rounded-lg text-xl sm:text-2xl font-semibold hover:bg-gray-400 transition-colors"
                    >
                      ปิด
                    </button>
                    <button
                      onClick={handleSaveRemark}
                      className="bg-[#15803D] text-white px-6 py-3 rounded-lg text-xl sm:text-2xl font-semibold hover:bg-[#166534] transition-colors"
                    >
                      บันทึก
                    </button>
                  </div>
                </>
              )}

              <div className="mt-4">
                <label className="block text-sm font-semibold mb-2 text-gray-700">
                  หมายเหตุ
                </label>
                <textarea
                  rows="3"
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  className="w-full border-2 border-gray-300 rounded-lg p-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#15803D] resize-none"
                  placeholder="เพิ่มหมายเหตุ..."
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default RoomCard;
