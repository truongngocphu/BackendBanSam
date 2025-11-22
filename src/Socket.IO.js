const { Server } = require("socket.io");
const Message = require("./model/ModelBanSam/Message");
const Conversation = require("./model/ModelBanSam/Conversation");

let io;

// ✅ Dùng Set để lưu danh sách user đang online, hiệu quả hơn object
const onlineUsers = new Set();

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: "http://localhost:3170", // Thay bằng URL frontend của bạn
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    console.log("🟢 Một người dùng đã kết nối:", socket.id);

    // Lắng nghe sự kiện 'join' từ client để biết ai đang online
    socket.on("join", (userId) => {
        console.log(`User ${userId} đã tham gia với socket ${socket.id}`);
        // Cho socket này vào một "phòng" riêng có tên chính là userId
        // Giúp gửi tin nhắn tới tất cả các thiết bị của user đó
        socket.join(userId);
        onlineUsers.add(userId);
        // Gửi danh sách người đang online tới tất cả client
        io.emit("getOnlineUsers", Array.from(onlineUsers));
    });

    // Lắng nghe sự kiện gửi tin nhắn
    socket.on("sendMessage", async ({ conversationId, senderId, receiverId, content }) => {
      try {
        // 1. Lưu tin nhắn vào DB với trạng thái đã đọc bởi người gửi
        const newMessage = new Message({
          conversationId,
          sender: senderId,
          content,
          readBy: [senderId], // Người gửi mặc định là đã đọc
        });
        await newMessage.save();

        // 2. Cập nhật lastMessage trong conversation
        await Conversation.findByIdAndUpdate(conversationId, {
            lastMessage: {
                content,
                sender: senderId,
                createdAt: new Date(),
            }
        });

        // 3. ✅ Populate thông tin người gửi để dữ liệu nhất quán
        const populatedMessage = await Message.findById(newMessage._id).populate('sender', 'hoTen avatar');

        // 4. ✅ Gửi tin nhắn tới "phòng" của người nhận
        io.to(receiverId).emit("receiveMessage", populatedMessage);

        // 5. ✅ Gửi lại tin nhắn cho chính người gửi (tới "phòng" của họ) để xác nhận
        io.to(senderId).emit("receiveMessage", populatedMessage);

      } catch (error) {
        console.error("Lỗi khi gửi tin nhắn:", error);
      }
    });

    socket.on("disconnect", () => {
        console.log("🔴 Người dùng đã ngắt kết nối:", socket.id);
        // Cần tìm ra userId nào đã ngắt kết nối để xóa khỏi onlineUsers
        // Cách đơn giản là khi client disconnect, nó gửi 1 event cuối cùng
        // Hoặc bạn cần một cấu trúc phức tạp hơn để map socket.id với userId
    });
  });

  return io;
};

const getIo = () => {
  if (!io) {
    throw new Error("Socket.io chưa được khởi tạo!");
  }
  return io;
};

module.exports = { initSocket, getIo };