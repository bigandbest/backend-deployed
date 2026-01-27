import prisma from "../config/prisma.js";

class CertificationDAO {
  async create(data) {
    return await prisma.certifications.create({ data });
  }

  async list(activeOnly = true) {
    return await prisma.certifications.findMany({
      where: activeOnly ? { active: true } : {},
      orderBy: { sort_order: "asc" },
    });
  }

  async update(id, data) {
    return await prisma.certifications.update({
      where: { id },
      data,
    });
  }

  async delete(id) {
    return await prisma.certifications.delete({ where: { id } });
  }

  // Wrapper methods to match controller expectations
  async listCertifications(activeOnly = true) {
    return this.list(activeOnly);
  }

  async createCertification(data) {
    return this.create(data);
  }

  async updateCertification(id, data) {
    return this.update(id, data);
  }

  async deleteCertification(id) {
    return this.delete(id);
  }
}

export default new CertificationDAO();
