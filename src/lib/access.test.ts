import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { closesPerDay, isEntityId, orderBooks, pickBooks, type Books } from "./access";

const books = (id: string, name: string, member: boolean, demo = !member): Books =>
  ({ id, name, periods: ["2026-01"], demo, member });

const mine = books("00000000-0000-4000-8000-000000000002", "Zed Co.", true);
const alsoMine = books("00000000-0000-4000-8000-000000000003", "Acme", true);
const demo = books("00000000-0000-4000-8000-000000000001", "Northwind Robotics, Inc.", false);

describe("access", () => {
  afterEach(() => { delete process.env.TICKMARK_CLOSES_PER_DAY; });

  test("the viewer's own books come before the demo, alphabetical within each", () => {
    assert.deepEqual(orderBooks([demo, mine, alsoMine]).map((b) => b.name), ["Acme", "Zed Co.", "Northwind Robotics, Inc."]);
  });

  test("a page shows the entity asked for only if the viewer may read it", () => {
    const readable = orderBooks([demo, mine]);
    assert.equal(pickBooks(readable, demo.id)?.id, demo.id);
    assert.equal(pickBooks(readable, [demo.id, mine.id])?.id, demo.id, "a repeated query param uses the first");
    // someone else's id falls back to the viewer's first book instead of being looked up
    assert.equal(pickBooks(readable, "00000000-0000-4000-8000-0000000000ff")?.id, mine.id);
    assert.equal(pickBooks(readable, undefined)?.id, mine.id);
    assert.equal(pickBooks([], mine.id), null);
  });

  test("only a uuid is treated as an entity id", () => {
    assert.equal(isEntityId(mine.id), true);
    assert.equal(isEntityId("Northwind Robotics, Inc."), false);
    assert.equal(isEntityId(`${mine.id},public_demo.eq.true`), false, "nothing can ride along into a filter");
    assert.equal(isEntityId(undefined), false);
  });

  test("the close allowance defaults to ten, and 0 turns closing off", () => {
    assert.equal(closesPerDay(), 10);
    process.env.TICKMARK_CLOSES_PER_DAY = "0";
    assert.equal(closesPerDay(), 0);
    process.env.TICKMARK_CLOSES_PER_DAY = "2.5";
    assert.throws(() => closesPerDay(), /integer/);
  });
});
