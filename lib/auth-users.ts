export const ADMIN_PASSWORD = "A30b07c01";

export const AUTH_USERS: Record<
  string,
  { userId: string; email: string; fullName: string; role: "admin" | "operator" | "viewer" }
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
  // Socios con rol viewer (visualización total, cero mutaciones)
  socio_daniel: {
    userId: "socio-daniel-shimaya",
    email: "socio.daniel@shimaya.pe",
    fullName: "SOCIO DANIEL",
    role: "viewer",
  },
  socio_jhony: {
    userId: "socio-jhony-shimaya",
    email: "socio.jhony@shimaya.pe",
    fullName: "SOCIO JHONY",
    role: "viewer",
  },
  socio_javier: {
    userId: "socio-javier-shimaya",
    email: "socio.javier@shimaya.pe",
    fullName: "SOCIO JAVIER",
    role: "viewer",
  },
  socio_riki: {
    userId: "socio-riki-shimaya",
    email: "socio.riki@shimaya.pe",
    fullName: "SOCIO RIKI",
    role: "viewer",
  },
  // Alias directos por slug
  daniel: {
    userId: "socio-daniel-shimaya",
    email: "socio.daniel@shimaya.pe",
    fullName: "SOCIO DANIEL",
    role: "viewer",
  },
  jhony: {
    userId: "socio-jhony-shimaya",
    email: "socio.jhony@shimaya.pe",
    fullName: "SOCIO JHONY",
    role: "viewer",
  },
  johnny: {
    userId: "socio-jhony-shimaya",
    email: "socio.jhony@shimaya.pe",
    fullName: "SOCIO JHONY",
    role: "viewer",
  },
  javier: {
    userId: "socio-javier-shimaya",
    email: "socio.javier@shimaya.pe",
    fullName: "SOCIO JAVIER",
    role: "viewer",
  },
  riki: {
    userId: "socio-riki-shimaya",
    email: "socio.riki@shimaya.pe",
    fullName: "SOCIO RIKI",
    role: "viewer",
  },
  ricky: {
    userId: "socio-riki-shimaya",
    email: "socio.riki@shimaya.pe",
    fullName: "SOCIO RIKI",
    role: "viewer",
  },
};

export const TEAM_OPTIONS = [
  { key: "admin", name: "ADMIN ADRIAN BARRANZUELA", isAdmin: true, role: "admin" },
  { key: "ale", name: "Ale Campos", isAdmin: false, role: "operator" },
  { key: "axl", name: "Axl Llontop", isAdmin: false, role: "operator" },
  { key: "celular", name: "Celular Tienda", isAdmin: false, role: "operator" },
  { key: "doris", name: "Doris Yanela Rojas Chilcon", isAdmin: false, role: "operator" },
  { key: "socio_daniel", name: "SOCIO DANIEL", isAdmin: false, role: "viewer" },
  { key: "socio_jhony", name: "SOCIO JHONY", isAdmin: false, role: "viewer" },
  { key: "socio_javier", name: "SOCIO JAVIER", isAdmin: false, role: "viewer" },
  { key: "socio_riki", name: "SOCIO RIKI", isAdmin: false, role: "viewer" },
];

export const DEFAULT_AUTH_USER = AUTH_USERS.admin;
