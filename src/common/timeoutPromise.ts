export default function (promise, ms: number = 0) {
    const timeout = new Promise((resolve, reject) => {
        const id = setTimeout(() => {
            clearTimeout(id);
            reject(`Timed out in ${ms} ms.`);
        }, ms);
    });

    return Promise.race([promise, timeout]);
}
