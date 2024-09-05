import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { getStorage } from 'firebase-admin/storage';
import { getDatabase } from 'firebase-admin/database';
import axios from 'axios';

initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID, databaseURL: process.env.FIREBASE_DATABASE_URL });

const firestore = getFirestore();
const storage = getStorage();
const messaging = getMessaging();
const database = getDatabase();

// ignore undefined properties in firestore.
firestore.settings({ ignoreUndefinedProperties: true });

export default firestore;
export { Timestamp, FieldValue, storage, messaging, firestore, database };

// Define your types
export interface Office {
    id: string;
    title: string;
    identifiers: {
        youtubeChannel?: string;
    };
    party?: string;
    thumbnailUrl?: string;
}

export interface VideoStream {
    actualEndTime?: Date;
    actualStartTime?: Date;
    channelId: string;
    channelParty: string;
    channelTitle: string;
    description: string;
    etag: string;
    id: string;
    liveBroadcast: string;
    concurrentViewers: number;
    office: {
        id: string;
        thumbnailUrl: string;
        title: string;
    };
    officeId: string;
    publishedAt: Date;
    scheduledStartTime?: Date;
    scheduledEndTime?: Date;
    thumbnails: {
        default: {
            height: number;
            url: string;
            width: number;
        };
        high: {
            height: number;
            url: string;
            width: number;
        };
        maxres: {
            height: number;
            url: string;
            width: number;
        };
        medium: {
            height: number;
            url: string;
            width: number;
        };
        standard: {
            height: number;
            url: string;
            width: number;
        };
    };
    title: string;
    videoId: string;
}

interface YoutubeVideo {
    id: {
        videoId?: string;
    } | string;
    etag: string;
    snippet: {
        publishedAt: string;
        channelId: string;
        title: string;
        description: string;
        thumbnails: VideoStream['thumbnails'];
        channelTitle: string;
        liveBroadcastContent: string;
    };
    liveStreamingDetails?: {
        actualStartTime?: string;
        actualEndTime?: string;
        scheduledStartTime?: string;
        scheduledEndTime?: string;
        concurrentViewers?: number;
    };
}

async function mapFromYoutube(d: YoutubeVideo, office?: Office): Promise<VideoStream | null> {
    if (!office) {
        office = await firestore.collection('Offices').where('identifiers.youtubeChannel', '==', d.snippet.channelId).get().then((snapshot) => {
            if (snapshot.empty) {
                return null;
            }
            const office: Office = {
                id: snapshot.docs[0].id,
                ...snapshot.docs[0].data() as Office,
            };
            return office;
        });
    }
    if (!office) {
        console.error(`Office not found for Youtube Account ${d.snippet.channelId}`);
        return null;
    }
    let publishedAt = new Date(d.snippet.publishedAt);
    if (d.liveStreamingDetails?.actualStartTime) {
        publishedAt = new Date(d.liveStreamingDetails.actualStartTime);
    }
    if (d.liveStreamingDetails?.scheduledStartTime) {
        publishedAt = new Date(d.liveStreamingDetails.scheduledStartTime);
    }
    if (d.liveStreamingDetails?.actualEndTime) {
        publishedAt = new Date(d.liveStreamingDetails.actualEndTime);
    }
    return {
        id: String(typeof d.id === 'string' ? d.id : d.id.videoId),
        videoId: String(typeof d.id === 'string' ? d.id : d.id.videoId),
        etag: d.etag,
        channelId: d.snippet.channelId,
        channelParty: office.party || '',
        channelTitle: d.snippet.channelTitle,
        description: d.snippet.description,
        thumbnails: d.snippet.thumbnails,
        liveBroadcast: d.snippet.liveBroadcastContent,
        concurrentViewers: d.liveStreamingDetails?.concurrentViewers || 0,
        scheduledStartTime: d.liveStreamingDetails?.scheduledStartTime
            ? new Date(d.liveStreamingDetails.scheduledStartTime)
            : undefined,
        actualStartTime: d.liveStreamingDetails?.actualStartTime
            ? new Date(d.liveStreamingDetails.actualStartTime)
            : undefined,
        scheduledEndTime: d.liveStreamingDetails?.scheduledEndTime
            ? new Date(d.liveStreamingDetails.scheduledEndTime)
            : undefined,
        actualEndTime: d.liveStreamingDetails?.actualEndTime
            ? new Date(d.liveStreamingDetails.actualEndTime)
            : undefined,
        title: d.snippet.title,
        publishedAt,
        officeId: office.id,
        office: {
            id: office.id,
            title: office.title,
            thumbnailUrl: office.thumbnailUrl || '',
        }
    };
}

// Implement the upsertFromVideoId function
export async function upsertFromVideoId(videoId: string): Promise<YoutubeVideo | undefined> {
    try {
        const { data } = await axios.get(
            'https://youtube.googleapis.com/youtube/v3/videos',
            {
                params: {
                    key: process.env.YOUTUBE_API_KEY,
                    part: 'snippet,liveStreamingDetails',
                    id: videoId,
                },
            }
        );
        if (!data.items.length) {
            await firestore.collection('VideoStreams').doc(videoId).delete();
            return;
        }
        if (!data.items[0].liveStreamingDetails) {
            return;
        }
        const mappedItem = await mapFromYoutube(data.items[0]);
        if (mappedItem) {
            await firestore.collection('VideoStreams').doc(mappedItem.id).set(mappedItem)
            if (mappedItem.liveBroadcast === 'live' && (mappedItem.officeId === '27' || mappedItem.officeId === '14')) {
                await firestore.collection('Variables').doc('floor').update({
                    videoId: mappedItem.id,
                })
                console.info(`Updated Dome Watch default video to "${mappedItem.id}"`);
            }
        }
        return data.items[0];
    } catch (e: any) {
        if (e.response?.status === 400) {
            await firestore.collection('VideoStreams').doc(videoId).delete();
            return;
        } else if (e.response?.status === 403) {
            console.error(e);
            throw new Error('Youtube quota exceeded');
        } else {
            console.error(e);
            throw new Error(e.message);
        }
    }
}