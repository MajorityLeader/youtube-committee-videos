import dayjs from 'dayjs'
// You'll need to implement or import these functions/types
import { VideoStream, upsertFromVideoId } from '~/controllers/firebase'

export default defineEventHandler(async () => {
    try {
        const startOfDay = dayjs().startOf('day').toDate();
        const endOfDay = dayjs().endOf('day').toDate();

        const live = await firestore
            .collection('VideoStreams')
            .where('liveBroadcast', '==', 'live')
            .get();

        const upcoming = await firestore
            .collection('VideoStreams')
            .where('liveBroadcast', '==', 'upcoming')
            .where('scheduledStartTime', '>', startOfDay)
            .where('scheduledStartTime', '<', endOfDay)
            .get();

        const items = [...live.docs, ...upcoming.docs];

        for (const item of items) {
            try {
                const doc = item.data() as VideoStream;
                await upsertFromVideoId(doc.id);
            } catch (e) {
                console.error(e);
            }
        }

        console.log(`Finished polling ${items.length} live and upcoming videos.`)
        return { message: `Updated ${items.length} live and upcoming videos` }
    } catch (error) {
        console.error('Error in updateAllLiveUpcoming:', error);
        return { error: 'An error occurred while processing the request' }
    }
})
