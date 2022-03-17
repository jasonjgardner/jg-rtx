import {  makeFlipbooks, makeParticles } from './atlas.ts'

Deno.test('Test generating flipbooks', async () => {{
    await makeFlipbooks()
}})

Deno.test('Test generating particles', async () => {{
    await makeParticles()
}})