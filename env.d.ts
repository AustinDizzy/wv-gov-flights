interface ProcessEnv {
    DB: string?;
    SQL_FILE: string?;
}

declare global {
  namespace NodeJS {
    interface ProcessEnv extends ProcessEnv {}
  }
}