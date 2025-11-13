import React, { useState, useEffect, useRef } from "react";

const RoomCard = ({ room, updateRoomImmediately, isLoggedIn, onLoginRequired, currentNickname, currentDate }) => {
  const [remark, setRemark] = useState(room.remark || "");
  const [popupOpen, setPopupOpen] = useState(false);
  const [toast, setToast] = useState(false);
  const toastTimeoutRef = useRef(null);

  // Sync state when room prop changes
  useEffect(() => {
    setRemark(room.remark || "");
  }, [room.remark]);

  // Cleanup toast timeout on unmount
  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  const colorMap = {
    cleaned: "bg-green-200",
    closed: "bg-gray-500 text-white",
    checked_out: "bg-red-300",
    vacant: "bg-white",
    stay_clean: "bg-blue-200",
    will_depart_today: "bg-yellow-200",
    long_stay: "bg-gray-200",
  };

  // Status options with Thai labels only
  const statusOptions = [
    { value: "cleaned", label: "ทำห้องเสร็จแล้ว", color: "bg-green-200" },
    { value: "closed", label: "ปิดห้อง", color: "bg-gray-500" },
    { value: "checked_out", label: "ออกแล้ว", color: "bg-red-300" },
    { value: "vacant", label: "ว่าง", color: "bg-white" },
    { value: "stay_clean", label: "พักต่อ", color: "bg-blue-200" },
    { value: "will_depart_today", label: "จะออกวันนี้", color: "bg-yellow-200" },
    { value: "long_stay", label: "รายเดือน", color: "bg-gray-200" },
  ];

  const isSuite = room.type?.toUpperCase().startsWith("S");
  const borderColor = room.border === "red" ? "border-2 border-red-600" : "border border-black";
  const isFO = currentNickname === "FO";

  // Handle status change and save
  const handleSave = async (statusUpdate) => {
    if (!isLoggedIn || !currentNickname) {
      onLoginRequired();
      return;
    }

    const wasCleaned = statusUpdate.status === "cleaned" && room.status !== "cleaned";
    
    const roomUpdates = {
      ...statusUpdate,
      cleanedToday: wasCleaned ? true : (room.cleanedToday || false),
      // FO doesn't add or overwrite names - preserve existing lastEditor
      lastEditor: isFO ? (room.lastEditor || "") : (currentNickname || ""),
      cleanedBy: wasCleaned ? (currentNickname || "") : (room.cleanedBy || ""),
      selectedBy: wasCleaned ? "" : (room.selectedBy || ""),
      // Set maid name only for non-FO users when cleaning - ensure no duplication
      maid: isFO ? (room.maid || "") : (statusUpdate.status === "cleaned" ? (currentNickname || "").trim() : (room.maid || ""))
    };
    
    // Ensure maid field doesn't contain duplicates
    if (roomUpdates.maid && typeof roomUpdates.maid === 'string') {
      // Remove any duplicate nicknames (in case of data corruption)
      const parts = roomUpdates.maid.trim().split(/\s+/);
      roomUpdates.maid = [...new Set(parts)].join(' ').trim();
    }

    // Update immediately for real-time sync
    if (updateRoomImmediately) {
      await updateRoomImmediately(room.number, roomUpdates);
      // Clear any existing timeout
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
      setToast(true);
      toastTimeoutRef.current = setTimeout(() => setToast(false), 1500);
    }
  };

  // Handle "เลือกห้องนี้" button - toggle border red/black
  const toggleBorder = async () => {
    if (!isLoggedIn || !currentNickname) {
      onLoginRequired();
      return;
    }

    // Toggle border: if currently red, change to black; if black, change to red
    const newBorder = room.border === "red" ? "black" : "red";
    
    const roomUpdates = {
      selectedBy: currentNickname || "",
      lastEditor: isFO ? (room.lastEditor || "") : (currentNickname || ""),
      border: newBorder,
      // For non-FO users, always set maid nickname when pressing "เลือกห้องนี้" so it displays
      maid: isFO ? (room.maid || "") : (currentNickname || "")
    };

    // Update immediately for real-time sync
    if (updateRoomImmediately) {
      await updateRoomImmediately(room.number, roomUpdates);
      // Clear any existing timeout
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
      setToast(true);
      toastTimeoutRef.current = setTimeout(() => setToast(false), 1500);
    }
  };

  // Save remark
  const saveRemark = async () => {
    if (!isLoggedIn || !currentNickname) {
      onLoginRequired();
      return;
    }
    
    let finalRemark = remark.trim();
    
    // If remark is not empty, append "รายงานโดย [nickname] [day month]"
    if (finalRemark && currentNickname && currentDate) {
      // Remove any existing "รายงานโดย" at the end
      finalRemark = finalRemark.replace(/\s*\(รายงานโดย .+\)\s*$/, '').trim();
      // Append new report info
      finalRemark += ` (รายงานโดย ${currentNickname} ${currentDate})`;
    }
    
    // Update immediately for real-time sync
    if (updateRoomImmediately) {
      await updateRoomImmediately(room.number, { remark: finalRemark });
      // Clear any existing timeout
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
      setToast(true);
      toastTimeoutRef.current = setTimeout(() => setToast(false), 1500);
    }
    
    setPopupOpen(false);
  };

  return (
    <>
      <div
        className={`relative rounded-lg shadow-sm p-1.5 cursor-pointer flex-shrink-0
        ${colorMap[room.status] || "bg-white"}
        ${isSuite ? "w-20" : "w-16"} h-16 flex flex-col justify-between
        ${borderColor}`}
        onClick={() => {
          if (isLoggedIn) {
            setPopupOpen(true);
          } else {
            onLoginRequired();
          }
        }}
      >
        <div className="flex-1 flex flex-col justify-between">
          <div>
            <div className="font-bold text-base leading-tight">{room.number}</div>
            <div className="text-[10px] text-[#63738A] leading-tight">{room.type}</div>
            {/* Show maid name only once, right below room type - ensure no duplicates, visible on all devices */}
            {room.maid && room.maid.trim() && (
              <div className="text-xs sm:text-[10px] italic text-[#0B1320] leading-tight mt-0.5 truncate block">
                {room.maid.trim()}
              </div>
            )}
          </div>
        </div>

        <div
          className={`absolute bottom-0.5 right-0.5 w-5 h-5 sm:w-4 sm:h-4 rounded-full cursor-pointer z-10 ${
            room.remark ? "bg-red-600" : "bg-gray-400"
          }`}
          onClick={(e) => {
            e.stopPropagation();
            if (isLoggedIn) {
              setPopupOpen(true);
            } else {
              onLoginRequired();
            }
          }}
          title={room.remark || "Add remark"}
        />
      </div>

      {/* Combined Popup Modal */}
      {popupOpen && (
        <div 
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setPopupOpen(false);
            }
          }}
        >
          <div 
            className="bg-white rounded-2xl p-5 w-full max-w-md shadow-lg max-h-[90vh] overflow-y-auto font-['Noto_Sans_Thai']"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-semibold mb-3 text-lg text-center text-[#0B1320]">
              ห้อง {room.number}
            </h2>
            
            {/* Status buttons */}
            {isFO ? (
              // FO users: show all status buttons in grid
              <div className="grid grid-cols-2 gap-2 mb-3">
                <button 
                  onClick={() => handleSave({ status: "cleaned", border: "black" })} 
                  className="bg-green-200 rounded-lg py-3 text-base font-semibold"
                >
                  ทำห้องเสร็จแล้ว
                </button>
                <button 
                  onClick={() => handleSave({ status: "closed" })} 
                  className="bg-gray-500 text-white rounded-lg py-3 text-base font-semibold"
                >
                  ปิดห้อง
                </button>
                <button 
                  onClick={() => handleSave({ status: "checked_out" })} 
                  className="bg-red-300 rounded-lg py-3 text-base font-semibold"
                >
                  ออกแล้ว
                </button>
                <button 
                  onClick={() => handleSave({ status: "vacant" })} 
                  className="bg-white border border-gray-300 rounded-lg py-3 text-base font-semibold"
                >
                  ว่าง
                </button>
                <button 
                  onClick={() => handleSave({ status: "stay_clean" })} 
                  className="bg-blue-200 rounded-lg py-3 text-base font-semibold"
                >
                  พักต่อ
                </button>
                <button 
                  onClick={() => handleSave({ status: "will_depart_today" })} 
                  className="bg-yellow-200 rounded-lg py-3 text-base font-semibold"
                >
                  จะออกวันนี้
                </button>
                <button 
                  onClick={() => handleSave({ status: "long_stay" })} 
                  className="bg-gray-200 rounded-lg py-3 text-base font-semibold"
                >
                  รายเดือน
                </button>
              </div>
            ) : (
              // Non-FO users: show only "ทำห้องเสร็จแล้ว" button, centered, full-width
              <div className="flex justify-center mb-3">
                <button
                  onClick={() => handleSave({ status: "cleaned", border: "black" })}
                  className="bg-green-200 rounded-lg px-8 py-4 text-lg font-semibold w-full"
                >
                  ทำห้องเสร็จแล้ว
                </button>
              </div>
            )}

            {/* Remark textarea */}
            <textarea
              value={remark}
              onChange={e => setRemark(e.target.value)}
              className="w-full border rounded-lg p-3 text-base h-24 mb-3"
              placeholder="เพิ่มหมายเหตุที่นี่..."
            />

            {/* Buttons */}
            <div className={`flex ${isFO ? "justify-end" : "justify-between"} gap-2`}>
              {/* "เลือกห้องนี้" button - only visible for non-FO users */}
              {!isFO && (
                <button
                  onClick={toggleBorder}
                  className={`px-4 py-3 rounded-lg text-base font-semibold transition-colors ${
                    room.border === "red"
                      ? "bg-red-600 text-white hover:bg-red-700"
                      : "bg-[#15803D] text-white hover:bg-[#166534]"
                  }`}
                  type="button"
                >
                  เลือกห้องนี้
                </button>
              )}
              <div className="flex gap-2 ml-auto">
                <button 
                  onClick={() => {
                    setPopupOpen(false);
                  }}
                  className="px-4 py-3 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors text-base font-semibold"
                >
                  ปิด
                </button>
                <button 
                  onClick={saveRemark}
                  className="px-4 py-3 bg-[#15803D] text-white rounded-lg hover:bg-[#166534] transition-colors text-base font-semibold"
                >
                  บันทึก
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#15803D] text-white px-6 py-3 rounded-lg shadow-lg text-base font-semibold z-50">
          ✅ บันทึกเรียบร้อย
        </div>
      )}
    </>
  );
};

export default RoomCard;
