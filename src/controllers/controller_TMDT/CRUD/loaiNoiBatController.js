const LoaiNoiBat = require("../../../model/ModelBanSam/LoaiNoiBat");

// Helper xuất JSON thống nhất
const resData = (res, status, success, message, data = null, extra = {}) => {
  return res.status(status).json({ success, message, data, ...extra });
};

// ======================================================
// CREATE
// ======================================================
exports.createLoaiNoiBat = async (req, res) => {
  try {
    const body = {
      ...req.body,
      priority: req.body.priority ? Number(req.body.priority) : 999,
    };

    const doc = await LoaiNoiBat.create(body);

    return resData(res, 201, true, "Tạo mới thành công", doc);
  } catch (error) {
    return resData(res, 400, false, "Tạo mới thất bại", null, { error: error.message });
  }
};

// ======================================================
// READ ALL (Pagination + Search + Sort + Priority Filter)
// ======================================================
exports.getAllLoaiNoiBat = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search = "",
      sortField = "priority",
      sortOrder = "ascend",
      priority,
    } = req.query;

    const query = {};

    // Search
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { mota: { $regex: search, $options: "i" } },
      ];
    }

    // Filter theo priority
    if (priority !== undefined && priority !== "") {
      query.priority = Number(priority);
    }

    // Sort
    const sort = {
      [sortField]: sortOrder === "ascend" ? 1 : -1,
    };

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      LoaiNoiBat.find(query).sort(sort).skip(skip).limit(Number(limit)),
      LoaiNoiBat.countDocuments(query),
    ]);

    return resData(res, 200, true, "Lấy danh sách thành công", data, {
      total,
      currentPage: Number(page),
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    return resData(res, 500, false, "Lấy danh sách thất bại", null, { error: error.message });
  }
};

// ======================================================
// READ ONE
// ======================================================
exports.getLoaiNoiBatById = async (req, res) => {
  try {
    const doc = await LoaiNoiBat.findById(req.params.id);
    if (!doc) return resData(res, 404, false, "Không tìm thấy");

    return resData(res, 200, true, "Lấy chi tiết thành công", doc);
  } catch (error) {
    return resData(res, 500, false, "Lấy chi tiết thất bại", null, { error: error.message });
  }
};

// ======================================================
// UPDATE
// ======================================================
exports.updateLoaiNoiBatById = async (req, res) => {
  try {
    const body = { ...req.body };

    if (req.body.priority !== undefined) {
      body.priority = Number(req.body.priority);
    }

    const doc = await LoaiNoiBat.findByIdAndUpdate(req.params.id, body, {
      new: true,
      runValidators: true,
    });

    if (!doc) return resData(res, 404, false, "Không tìm thấy");

    return resData(res, 200, true, "Cập nhật thành công", doc);
  } catch (error) {
    return resData(res, 400, false, "Cập nhật thất bại", null, { error: error.message });
  }
};

// ======================================================
// DELETE
// ======================================================
exports.deleteLoaiNoiBatById = async (req, res) => {
  try {
    const doc = await LoaiNoiBat.findByIdAndDelete(req.params.id);
    if (!doc) return resData(res, 404, false, "Không tìm thấy");

    return resData(res, 200, true, "Xóa thành công");
  } catch (error) {
    return resData(res, 500, false, "Xóa thất bại", null, { error: error.message });
  }
};
