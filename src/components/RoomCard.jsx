import React, { useState, useEffect } from "react";

const RoomCard = ({ room, updateRoomImmediately, isLoggedIn, onLoginRequired, currentNickname, currentDate }) => {
  const [remark, setRemark] = useState(room.remark || "");
  const [popupOpen, setPopupOpen] = useState(false);

  // Sync state when room prop changes
  useEffect(() => {
    setRemark(room.remark || "");
  }, [room.remark]);

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

  // Handle status change
  const handleStatusChange = async (newStatus) => {
    if (!isLoggedIn || !currentNickname) {
      onLoginRequired();
      return;
    }

    const wasCleaned = newStatus === "cleaned" && room.status !== "cleaned";
    
    const roomUpdates = {
      status: newStatus,
      cleanedToday: wasCleaned ? true : (room.cleanedToday || false),
      border: "black", // Always set border to black when changing status
      // FO doesn't add or overwrite names - preserve existing lastEditor
      lastEditor: isFO ? (room.lastEditor || "") : (currentNickname || ""),
      cleanedBy: wasCleaned ? (currentNickname || "") : (room.cleanedBy || ""),
      selectedBy: wasCleaned ? "" : (room.selectedBy || "")
    };

    // Update immediately for real-time sync
    if (updateRoomImmediately) {
      await updateRoomImmediately(room.number, roomUpdates);
    }
  };

  // Handle "เลือกห้องนี้" button - toggle border red/black
  const handleSelectRoom = async () => {
    if (!isLoggedIn || !currentNickname) {
      onLoginRequired();
      return;
    }

    // Toggle border: if currently red, change to black; if black, change to red
    const newBorder = room.border === "red" ? "black" : "red";
    
    const roomUpdates = {
      selectedBy: currentNickname || "",
      lastEditor: isFO ? (room.lastEditor || "") : (currentNickname || ""),
      border: newBorder
    };

    // Update immediately for real-time sync
    if (updateRoomImmediately) {
      await updateRoomImmediately(room.number, roomUpdates);
    }
  };

  // Save remark (and optionally status if changed)
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
            {(room.selectedBy || room.status === "cleaned") && room.lastEditor && (
              <div className="text-xs sm:text-[10px] text-[#15803D] italic leading-tight mt-0.5">
                {room.lastEditor}
              </div>
            )}
          </div>
          {room.maid && (
            <div className="text-xs sm:text-[10px] italic text-[#0B1320] truncate">{room.maid}</div>
          )}
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
            className="bg-white rounded-2xl p-6 w-full max-w-md shadow-lg max-h-[90vh] overflow-y-auto font-['Noto_Sans_Thai']"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-bold text-2xl mb-4 text-[#0B1320] text-center">
              ห้อง {room.number}
            </h2>
            
            {/* Status buttons */}
            <div className="mb-4">
              {isFO ? (
                // FO users: show all status buttons in grid
                <div className="grid grid-cols-2 gap-3">
                  {statusOptions.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => handleStatusChange(opt.value)}
                      className={`px-4 py-4 rounded-lg text-lg font-bold transition-colors ${
                        opt.value === "closed" ? "text-white" : "text-[#0B1320]"
                      } ${
                        room.status === opt.value 
                          ? `${opt.color} border-2 border-[#15803D]` 
                          : `${opt.color} border border-gray-300 hover:border-[#15803D]`
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              ) : (
                // Non-FO users: show only "ทำห้องเสร็จแล้ว" button, centered, full-width
                <div className="flex justify-center">
                  <button
                    onClick={() => handleStatusChange("cleaned")}
                    className={`w-full px-6 py-5 rounded-lg text-xl font-bold transition-colors text-center ${
                      room.status === "cleaned" 
                        ? "bg-green-200 border-2 border-[#15803D]" 
                        : "bg-green-200 border border-gray-300 hover:border-[#15803D]"
                    }`}
                  >
                    ทำห้องเสร็จแล้ว
                  </button>
                </div>
              )}
            </div>

            {/* Remark textarea */}
            <div className="mb-4">
              <textarea
                value={remark}
                onChange={e => setRemark(e.target.value)}
                className="w-full border rounded-lg p-3 text-lg h-24"
                placeholder="เพิ่มหมายเหตุที่นี่..."
              />
            </div>

            {/* Buttons */}
            <div className={`flex ${isFO ? "justify-end" : "justify-between"} gap-3`}>
              {/* "เลือกห้องนี้" button - only visible for non-FO users, default green */}
              {!isFO && (
                <button
                  onClick={handleSelectRoom}
                  className={`px-6 py-4 rounded-lg text-lg font-bold transition-colors cursor-pointer ${
                    room.border === "red"
                      ? "bg-red-600 text-white hover:bg-red-700"
                      : "bg-[#15803D] text-white hover:bg-[#166534]"
                  }`}
                  type="button"
                >
                  เลือกห้องนี้
                </button>
              )}
              <div className="flex gap-3">
                <button 
                  onClick={() => {
                    setPopupOpen(false);
                  }}
                  className="px-6 py-4 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors text-lg font-semibold"
                >
                  ปิด
                </button>
                <button 
                  onClick={saveRemark}
                  className="px-6 py-4 bg-[#15803D] text-white rounded-lg hover:bg-[#166534] transition-colors text-lg font-bold"
                >
                  บันทึก
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default RoomCard;
