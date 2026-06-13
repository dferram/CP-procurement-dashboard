const useAuth = () => {
    const { ref, computed } = Vue;
    
    const currentUserEmail = ref('');
    
    const userInitials = computed(() => {
        if(!currentUserEmail.value) return '';
        let namePart = currentUserEmail.value.split('@')[0];
        namePart = namePart.replace(/^bp_/, '');
        const parts = namePart.split(/[._-]/).filter(p => p.length > 0);
        if(parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
        if(namePart.length >= 2) return namePart.substring(0, 2).toUpperCase();
        return namePart.charAt(0).toUpperCase();
    });

    const isOwnerCheck = (proj) => {
        if (!proj) return false;
        if (!currentUserEmail.value) return true; // Local fallback
        return proj.ownerEmail === currentUserEmail.value;
    };

    const isCollaboratorCheck = (proj) => {
        if (!proj) return false;
        if (isOwnerCheck(proj)) return true; // Owners are also collaborators
        if (!currentUserEmail.value) return true; // Local fallback
        return (proj.collaboratorEmails || []).includes(currentUserEmail.value);
    };

    return {
        currentUserEmail,
        userInitials,
        isOwnerCheck,
        isCollaboratorCheck
    };
};
