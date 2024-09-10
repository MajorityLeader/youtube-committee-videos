import axios from 'axios';
import xml2js from 'xml2js'
import dayjs from 'dayjs'
import { Office, upsertFromVideoId } from '~/controllers/firebase'

export default defineEventHandler(async (event) => {
    const query = getQuery(event)
    const youtubeChannel = query.youtubeChannel as string | undefined

    try {
        let offices = await firestore.collection('Offices').where('identifiers.youtubeChannel', '!=', null).get().then((snapshot: any[]) => {
            const offices: any[] = [];
            snapshot.forEach((doc) => {
                offices.push({
                    id: doc.id,
                    ...doc.data(),
                });
            });
            return offices as Required<Office>[];
        });

        if (youtubeChannel) {
            offices = offices.filter((o: { identifiers: { youtubeChannel: string; }; }) => o.identifiers.youtubeChannel === youtubeChannel);
        }

        console.info(`Upserting video from ${offices.length} channels.`);

        for (const office of offices) {
            try {
                const data = await axios.get(`https://www.youtube.com/feeds/videos.xml?channel_id=${office.identifiers.youtubeChannel}`);
                const parser = new xml2js.Parser({ explicitArray: false });
                const json = await parser.parseStringPromise(data.data);
                let videos = json.feed.entry;

                if (!videos) {
                    console.error(`No videos found for ${office.title}`);
                    continue;
                }

                videos = videos.filter((v: any) => {
                    return new Date(v.updated) >= dayjs().subtract(1, 'day').startOf('day').toDate();
                });

                if (!videos.length) {
                    console.error(`No new videos found for ${office.title}`);
                    continue;
                }

                for (const video of videos) {
                    try {
                        const id = video['yt:videoId']
                        if (!id) {
                            console.error(`No videoId found for ${office.title}`);
                            continue;
                        }
                        await upsertFromVideoId(id);
                    } catch (e) {
                        console.error(`Trouble parsing Youtube video: ${e}`);
                    }
                }
                console.log(`Finished upserting videos from ${office.title}.`)
            } catch (e) {
                console.error(`upsertFromAllChannels error: ${e}`);
            }
        }

        return { message: 'Upsert from all channels completed successfully' }
    } catch (error) {
        console.error('Error in upsertFromAllChannels:', error);
        return { error: 'An error occurred while processing the request' }
    }
})