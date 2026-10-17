export const ADMIN_PASSWORD = "A30b07c01";

export const AUTH_USERS: Record<
  string,
  { userId: string; email: string; fullName: string; role: "admin" | "operator" }
> = {
  admin: {
    userId: "wNhManJrwsi8DIq0POByz4Rf2f8TNv8J143HJdh7RdMRewC1cNtQmS",
    email: "adrianbarranzuela0108@gmail.com",
    fullName: "ADMIN ADRIAN BARRANZUELA",
    role: "admin",
  },
  ale: {
    userId: "ojt8TLRZnEF7wRdnXbk2x1SMuXDL4gKbjDJuv4ttYeNcBJI7ZLbry0",
    email: "alecampitos762@gmail.com",
    fullName: "Ale Campos",
    role: "operator",
  },
  axl: {
    userId: "onazIWluMmrDS2jwacfiFylCt8M8IlYwDgzn8ivPXR5Oi54XYtdHyr",
    email: "axlali33@gmail.com",
    fullName: "Axl Llontop",
    role: "operator",
  },
  celular: {
    userId: "xE6QxGkvkoXtVGq4mYKqxC0IHjzgJlkVVxMXfiutZymGp1G98xjwv1",
    email: "tablets.chiclashi@gmail.com",
    fullName: "Celular Tienda",
    role: "operator",
  },
  doris: {
    userId: "zIEqlW3sklm75keZGvuUbOtBiHnbxVdIhzExS089MQ8EiEKtxs3E1J",
    email: "drojaschilcon@gmail.com",
    fullName: "Doris Yanela Rojas Chilcon",
    role: "operator",
  },
};

export const TEAM_OPTIONS = [
  { key: "admin", name: "ADMIN ADRIAN BARRANZUELA", isAdmin: true, role: "admin" },
  { key: "ale", name: "Ale Campos", isAdmin: false, role: "operator" },
  { key: "axl", name: "Axl Llontop", isAdmin: false, role: "operator" },
  { key: "celular", name: "Celular Tienda", isAdmin: false, role: "operator" },
  { key: "doris", name: "Doris Yanela Rojas Chilcon", isAdmin: false, role: "operator" },
];

export const DEFAULT_AUTH_USER = AUTH_USERS.admin;
