import TeamMemberDAO from "../dao/team-member.dao.js";

// Get all team members
export const getTeamMembers = async (req, res) => {
    try {
        const data = await TeamMemberDAO.list();

        res.status(200).json({
            success: true,
            data,
        });
    } catch (error) {
        console.error("Error fetching team members:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch team members",
            error: error.message,
        });
    }
};

// Add a new team member
export const addTeamMember = async (req, res) => {
    try {
        const { name, designation, image_url } = req.body;

        if (!name || !designation) {
            return res.status(400).json({
                success: false,
                message: "Name and designation are required",
            });
        }

        const data = await TeamMemberDAO.create({
            name,
            designation,
            image_url
        });

        res.status(201).json({
            success: true,
            message: "Team member added successfully",
            data,
        });

        res.status(201).json({
            success: true,
            message: "Team member added successfully",
            data,
        });
    } catch (error) {
        console.error("Error adding team member:", error);
        res.status(500).json({
            success: false,
            message: "Failed to add team member",
            error: error.message,
        });
    }
};

// Update a team member
export const updateTeamMember = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, designation, image_url } = req.body;

        const data = await TeamMemberDAO.update(id, {
            name,
            designation,
            image_url
        });

        res.status(200).json({
            success: true,
            message: "Team member updated successfully",
            data,
        });
    } catch (error) {
        console.error("Error updating team member:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update team member",
            error: error.message,
        });
    }
};

// Delete a team member
export const deleteTeamMember = async (req, res) => {
    try {
        const { id } = req.params;

        await TeamMemberDAO.delete(id);

        res.status(200).json({
            success: true,
            message: "Team member deleted successfully",
        });
    } catch (error) {
        console.error("Error deleting team member:", error);
        res.status(500).json({
            success: false,
            message: "Failed to delete team member",
            error: error.message,
        });
    }
};
