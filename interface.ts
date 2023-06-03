import { Algorithm } from 'speakeasy'

export type studentInfoType = {
    duid: string;
    id: string;
    secret: String;
};

export type env = {
    TOKEN: string;
    CLIENT_ID: string;
    GUILD_ID: string;
    WELCOME_CHANNEL_ID: string;
    DB_URL: string;
    ALGORITHM: Algorithm;
    MEMBER_IDS: string;
}