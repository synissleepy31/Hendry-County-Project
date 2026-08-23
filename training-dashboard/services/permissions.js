// HCP Interactive Training - Discord role permissions
export const TRAINING_ROLES = {
    management: "1533590255842627761",
    admin: "1533590255842627761",
    departments: {
        HCSO: { fto: "1533639546531614901", trainee: "1533636130791096393" },
        CPD:  { fto: "1533640225753006171", trainee: "1533641168775151728" },
        FHP:  { fto: "1533631308557844541", trainee: "1533634185854718042" }
    }
};

export function getPermissions(req) {
    const roles = new Set(req.session?.trainingRoles || []);
    const isManagement = roles.has(TRAINING_ROLES.management) || roles.has(TRAINING_ROLES.admin);
    const ftoDepartments = Object.entries(TRAINING_ROLES.departments)
        .filter(([, cfg]) => roles.has(cfg.fto))
        .map(([code]) => code);
    const traineeDepartments = Object.entries(TRAINING_ROLES.departments)
        .filter(([, cfg]) => roles.has(cfg.trainee))
        .map(([code]) => code);
    return { isManagement, isAdmin: isManagement, ftoDepartments, traineeDepartments, roles: [...roles] };
}

export function renderAccessDenied(
    req,
    res,
    message = "You do not have permission to access this section of Hendry County Project Interactive Training."
) {
    return res
        .status(403)
        .render(
            "access-denied",
            {
                message
            }
        );
}

export function requireManagement(req, res, next) {
    if (!req.session?.trainingUser) {
        return res.redirect("/login");
    }

    if (!getPermissions(req).isManagement) {
        return renderAccessDenied(
            req,
            res,
            "You do not have permission to access Training Management."
        );
    }

    next();
}

export function requireFtoAccess(req, res, next) {
    if (!req.session?.trainingUser) {
        return res.redirect("/login");
    }

    const p = getPermissions(req);

    if (
        !p.isManagement &&
        p.ftoDepartments.length === 0
    ) {
        return renderAccessDenied(
            req,
            res,
            "You do not have an FTO role for any training department."
        );
    }

    next();
}

export function canAccessDepartment(req, departmentCode, mode = "fto") {
    const p = getPermissions(req);
    if (p.isManagement) return true;
    const code = String(departmentCode || "").toUpperCase();
    return mode === "trainee" ? p.traineeDepartments.includes(code) : p.ftoDepartments.includes(code);
}


export function isTrainingOwner(req) {
    const permissions =
        getPermissions(req);

    const configuredOwnerRole =
        String(
            process.env.TRAINING_OWNER_ROLE_ID ||
            ""
        ).trim();

    if (configuredOwnerRole) {
        return permissions.roles.includes(
            configuredOwnerRole
        );
    }

    // Safe backwards-compatible fallback until a dedicated Owner role is configured.
    return permissions.isManagement;
}


export function requireTrainingOwner(
    req,
    res,
    next
) {
    if (
        !req.session?.trainingUser
    ) {
        return res.redirect(
            "/login"
        );
    }

    if (
        !isTrainingOwner(req)
    ) {
        return renderAccessDenied(
            req,
            res,
            "Only the Interactive Training owner can access this area."
        );
    }

    next();
}
