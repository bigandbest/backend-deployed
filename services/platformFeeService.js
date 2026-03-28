import prisma from "../config/prisma.js";

const ENTITY_TYPES = {
  CATEGORY: "category",
  SUBCATEGORY: "subcategory",
  GROUP: "group",
};

const FEE_MIN = 0;
const FEE_MAX = 100;

function feeConfig(client = prisma) {
  const delegate =
    client.platform_fee_configurations || client.platformFeeConfigurations;

  if (!delegate) {
    throw new Error(
      "Platform fee model not available in current Prisma runtime. Restart backend after prisma generate.",
    );
  }
  return delegate;
}

function feeGroupConfig(client = prisma) {
  const delegate = client.platform_fee_groups || client.platformFeeGroups;
  if (!delegate) {
    throw new Error(
      "Platform fee group model not available in current Prisma runtime. Restart backend after prisma generate.",
    );
  }
  return delegate;
}

function feeGroupEntityConfig(client = prisma) {
  const delegate =
    client.platform_fee_group_entities || client.platformFeeGroupEntities;
  if (!delegate) {
    throw new Error(
      "Platform fee group entity model not available in current Prisma runtime. Restart backend after prisma generate.",
    );
  }
  return delegate;
}

function assertValidEntityType(entityType) {
  if (!Object.values(ENTITY_TYPES).includes(entityType)) {
    throw new Error("Invalid entity_type. Allowed values: category, subcategory, group");
  }
}

function assertValidFeePercentage(feePercentage) {
  const numericFee = Number(feePercentage);
  if (!Number.isFinite(numericFee)) {
    throw new Error("fee_percentage must be a valid number");
  }
  if (numericFee < FEE_MIN || numericFee > FEE_MAX) {
    throw new Error("fee_percentage must be between 0 and 100");
  }
}

async function getCategoryWithDescendants(categoryId) {
  return prisma.categories.findUnique({
    where: { id: categoryId },
    include: {
      subcategories: {
        select: {
          id: true,
          groups: { select: { id: true } },
        },
      },
    },
  });
}

async function getSubcategoryWithParent(subcategoryId) {
  return prisma.subcategories.findUnique({
    where: { id: subcategoryId },
    include: {
      categories: { select: { id: true, name: true } },
      groups: { select: { id: true } },
    },
  });
}

async function ensureNoExistingFeeForEntity(entityType, entityId, tx = prisma) {
  const [existingDirect, existingGroupEntity] = await Promise.all([
    feeConfig(tx).findUnique({
      where: {
        entity_type_entity_id: {
          entity_type: entityType,
          entity_id: entityId,
        },
      },
    }),
    feeGroupEntityConfig(tx).findUnique({
      where: {
        entity_type_entity_id: {
          entity_type: entityType,
          entity_id: entityId,
        },
      },
      include: {
        fee_group: {
          select: { id: true, name: true },
        },
      },
    }),
  ]);

  if (existingDirect) {
    throw new Error("Platform fee already exists for this entity");
  }
  if (existingGroupEntity) {
    throw new Error(
      `Platform fee already exists for this entity in fee group "${existingGroupEntity.fee_group?.name || existingGroupEntity.fee_group_id}"`,
    );
  }
}

export async function validateCategoryCreationLock(categoryId) {
  const categoryFee = await feeConfig(prisma).findUnique({
    where: {
      entity_type_entity_id: {
        entity_type: ENTITY_TYPES.CATEGORY,
        entity_id: categoryId,
      },
    },
  });

  if (categoryFee) {
    throw new Error(
      "Cannot create subcategory: category has a platform fee assigned (hierarchy locked)",
    );
  }
}

export async function validateGroupCreationLock(subcategoryId) {
  const subcategory = await prisma.subcategories.findUnique({
    where: { id: subcategoryId },
    select: { id: true, category_id: true },
  });
  if (!subcategory) throw new Error("Subcategory not found");

  const [subcategoryFee, categoryFee] = await Promise.all([
    feeConfig(prisma).findUnique({
      where: {
        entity_type_entity_id: {
          entity_type: ENTITY_TYPES.SUBCATEGORY,
          entity_id: subcategory.id,
        },
      },
    }),
    feeConfig(prisma).findUnique({
      where: {
        entity_type_entity_id: {
          entity_type: ENTITY_TYPES.CATEGORY,
          entity_id: subcategory.category_id,
        },
      },
    }),
  ]);

  if (subcategoryFee) {
    throw new Error(
      "Cannot create group: subcategory has a platform fee assigned (hierarchy locked)",
    );
  }
  if (categoryFee) {
    throw new Error(
      "Cannot create group: parent category has a platform fee assigned (hierarchy locked)",
    );
  }
}

async function validateAssignmentRules(entityType, entityId, tx = prisma) {
  assertValidEntityType(entityType);
  await ensureNoExistingFeeForEntity(entityType, entityId, tx);

  if (entityType === ENTITY_TYPES.CATEGORY) {
    const category = await getCategoryWithDescendants(entityId);
    if (!category) throw new Error("Category not found");

    // Allow assigning fee even when hierarchy already exists.
    // Block only if conflicting lower-level fee rules are already present.
    const subcategoryIds = category.subcategories.map((s) => s.id);
    const groupIds = category.subcategories.flatMap((s) =>
      (s.groups || []).map((g) => g.id),
    );

    const [existingSubcategoryFees, existingGroupFees] = await Promise.all([
      subcategoryIds.length > 0
        ? feeConfig(tx).findMany({
            where: {
              entity_type: ENTITY_TYPES.SUBCATEGORY,
              entity_id: { in: subcategoryIds },
            },
          })
        : Promise.resolve([]),
      groupIds.length > 0
        ? feeConfig(tx).findMany({
            where: {
              entity_type: ENTITY_TYPES.GROUP,
              entity_id: { in: groupIds },
            },
          })
        : Promise.resolve([]),
    ]);

    if (existingSubcategoryFees.length > 0 || existingGroupFees.length > 0) {
      throw new Error(
        "Cannot assign category-level fee: conflicting subcategory/group fee rules already exist",
      );
    }
  }

  if (entityType === ENTITY_TYPES.SUBCATEGORY) {
    const subcategory = await getSubcategoryWithParent(entityId);
    if (!subcategory) throw new Error("Subcategory not found");

    const [categoryFee, groupFees] = await Promise.all([
      feeConfig(tx).findUnique({
        where: {
          entity_type_entity_id: {
            entity_type: ENTITY_TYPES.CATEGORY,
            entity_id: subcategory.category_id,
          },
        },
      }),
      subcategory.groups.length > 0
        ? feeConfig(tx).findMany({
            where: {
              entity_type: ENTITY_TYPES.GROUP,
              entity_id: { in: subcategory.groups.map((g) => g.id) },
            },
          })
        : Promise.resolve([]),
    ]);

    if (categoryFee) {
      throw new Error(
        "Cannot assign subcategory-level fee: parent category already has a platform fee",
      );
    }
    if (groupFees.length > 0) {
      throw new Error(
        "Cannot assign subcategory-level fee: descendant groups already have platform fee rules",
      );
    }
  }

  if (entityType === ENTITY_TYPES.GROUP) {
    const group = await tx.groups.findUnique({
      where: { id: entityId },
      select: { id: true, subcategory_id: true },
    });
    if (!group) throw new Error("Group not found");

    const subcategory = await tx.subcategories.findUnique({
      where: { id: group.subcategory_id },
      select: { category_id: true },
    });
    if (!subcategory) throw new Error("Parent subcategory not found");

    const [subcategoryFee, categoryFee] = await Promise.all([
      feeConfig(tx).findUnique({
        where: {
          entity_type_entity_id: {
            entity_type: ENTITY_TYPES.SUBCATEGORY,
            entity_id: group.subcategory_id,
          },
        },
      }),
      feeConfig(tx).findUnique({
        where: {
          entity_type_entity_id: {
            entity_type: ENTITY_TYPES.CATEGORY,
            entity_id: subcategory.category_id,
          },
        },
      }),
    ]);

    if (subcategoryFee) {
      throw new Error(
        "Cannot assign group-level fee: parent subcategory already has a platform fee",
      );
    }
    if (categoryFee) {
      throw new Error(
        "Cannot assign group-level fee: parent category already has a platform fee",
      );
    }
  }
}

async function updateEntityHasFeeFlag(entityType, entityId, hasFee, tx = prisma) {
  if (entityType === ENTITY_TYPES.CATEGORY) {
    await tx.categories.update({
      where: { id: entityId },
      data: { has_fee: hasFee },
    });
    return;
  }
  if (entityType === ENTITY_TYPES.SUBCATEGORY) {
    await tx.subcategories.update({
      where: { id: entityId },
      data: { has_fee: hasFee },
    });
    return;
  }
  await tx.groups.update({
    where: { id: entityId },
    data: { has_fee: hasFee },
  });
}

export async function assignPlatformFee({
  entityType,
  entityId,
  feePercentage,
  createdBy = null,
}) {
  assertValidEntityType(entityType);
  assertValidFeePercentage(feePercentage);

  return prisma.$transaction(async (tx) => {
    await validateAssignmentRules(entityType, entityId, tx);

    const created = await feeConfig(tx).create({
      data: {
        entity_type: entityType,
        entity_id: entityId,
        fee_percentage: Number(feePercentage),
        is_active: true,
        created_by: createdBy,
      },
    });

    await updateEntityHasFeeFlag(entityType, entityId, true, tx);
    return created;
  });
}

export async function assignPlatformFeeGroup({
  groupName,
  entityType,
  entityIds,
  feePercentage,
  createdBy = null,
}) {
  assertValidEntityType(entityType);
  assertValidFeePercentage(feePercentage);

  const normalizedEntityIds = Array.from(
    new Set((entityIds || []).filter(Boolean)),
  );

  if (normalizedEntityIds.length === 0) {
    throw new Error("entity_ids must contain at least one entity id");
  }

  const finalGroupName =
    (groupName || "").trim() || `${entityType}-fee-group-${Date.now()}`;

  return prisma.$transaction(async (tx) => {
    for (const entityId of normalizedEntityIds) {
      await validateAssignmentRules(entityType, entityId, tx);
    }

    const createdGroup = await feeGroupConfig(tx).create({
      data: {
        name: finalGroupName,
        entity_type: entityType,
        fee_percentage: Number(feePercentage),
        is_active: true,
        created_by: createdBy,
      },
    });

    await feeGroupEntityConfig(tx).createMany({
      data: normalizedEntityIds.map((entityId) => ({
        fee_group_id: createdGroup.id,
        entity_type: entityType,
        entity_id: entityId,
      })),
    });

    for (const entityId of normalizedEntityIds) {
      await updateEntityHasFeeFlag(entityType, entityId, true, tx);
    }

    const entities = await feeGroupEntityConfig(tx).findMany({
      where: { fee_group_id: createdGroup.id },
      select: { entity_id: true },
      orderBy: { entity_id: "asc" },
    });

    return {
      ...createdGroup,
      fee_percentage: Number(createdGroup.fee_percentage),
      entity_ids: entities.map((e) => e.entity_id),
    };
  });
}

export async function removePlatformFee({ entityType, entityId }) {
  assertValidEntityType(entityType);

  return prisma.$transaction(async (tx) => {
    const existing = await feeConfig(tx).findUnique({
      where: {
        entity_type_entity_id: {
          entity_type: entityType,
          entity_id: entityId,
        },
      },
    });

    if (!existing) {
      throw new Error("Platform fee not found");
    }

    await feeConfig(tx).delete({
      where: {
        entity_type_entity_id: {
          entity_type: entityType,
          entity_id: entityId,
        },
      },
    });

    const groupedFee = await feeGroupEntityConfig(tx).findUnique({
      where: {
        entity_type_entity_id: {
          entity_type: entityType,
          entity_id: entityId,
        },
      },
    });

    await updateEntityHasFeeFlag(entityType, entityId, !!groupedFee, tx);
    return existing;
  });
}

export async function listPlatformFeeGroups() {
  const rows = await feeGroupConfig(prisma).findMany({
    where: { is_active: true },
    include: {
      entities: {
        select: { entity_id: true },
        orderBy: { entity_id: "asc" },
      },
    },
    orderBy: [{ created_at: "desc" }],
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    entity_type: row.entity_type,
    fee_percentage: Number(row.fee_percentage),
    is_active: !!row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
    entity_ids: row.entities.map((e) => e.entity_id),
  }));
}

export async function deletePlatformFeeGroup(groupId) {
  if (!groupId) throw new Error("groupId is required");

  return prisma.$transaction(async (tx) => {
    const existingGroup = await feeGroupConfig(tx).findUnique({
      where: { id: groupId },
      include: {
        entities: {
          select: { entity_type: true, entity_id: true },
        },
      },
    });

    if (!existingGroup) {
      throw new Error("Fee group not found");
    }

    await feeGroupConfig(tx).delete({
      where: { id: groupId },
    });

    for (const entity of existingGroup.entities) {
      const [directFee, groupedFee] = await Promise.all([
        feeConfig(tx).findUnique({
          where: {
            entity_type_entity_id: {
              entity_type: entity.entity_type,
              entity_id: entity.entity_id,
            },
          },
        }),
        feeGroupEntityConfig(tx).findUnique({
          where: {
            entity_type_entity_id: {
              entity_type: entity.entity_type,
              entity_id: entity.entity_id,
            },
          },
        }),
      ]);

      await updateEntityHasFeeFlag(
        entity.entity_type,
        entity.entity_id,
        !!directFee || !!groupedFee,
        tx,
      );
    }

    return {
      id: existingGroup.id,
      name: existingGroup.name,
      entity_type: existingGroup.entity_type,
      fee_percentage: Number(existingGroup.fee_percentage),
      entity_ids: existingGroup.entities.map((e) => e.entity_id),
    };
  });
}

export async function resolveApplicablePlatformFee({
  categoryId = null,
  subcategoryId = null,
  groupId = null,
}) {
  console.log(`Resolving platform fee for categoryId=${categoryId}, subcategoryId=${subcategoryId}, groupId=${groupId}`);
  if (groupId) {
    const [groupFee, groupedGroupFee] = await Promise.all([
      feeConfig(prisma).findUnique({
        where: {
          entity_type_entity_id: {
            entity_type: ENTITY_TYPES.GROUP,
            entity_id: groupId,
          },
        },
      }),
      feeGroupEntityConfig(prisma).findUnique({
        where: {
          entity_type_entity_id: {
            entity_type: ENTITY_TYPES.GROUP,
            entity_id: groupId,
          },
        },
        include: { fee_group: true },
      }),
    ]);
    if (groupFee) {
      console.log(`Resolved platform fee at GROUP level (ID: ${groupId}): ${groupFee.fee_percentage}%`);
      return {
        fee_percentage: Number(groupFee.fee_percentage),
        source_level: ENTITY_TYPES.GROUP,
        source_entity_id: groupId,
        source_type: "single",
      };
    }
    if (groupedGroupFee?.fee_group) {
      console.log(`Resolved platform fee from GROUP FEE GROUP "${groupedGroupFee.fee_group.name}" (ID: ${groupId}): ${groupedGroupFee.fee_group.fee_percentage}%`);
      return {
        fee_percentage: Number(groupedGroupFee.fee_group.fee_percentage),
        source_level: ENTITY_TYPES.GROUP,
        source_entity_id: groupId,
        source_type: "group",
        source_group_id: groupedGroupFee.fee_group.id,
        source_group_name: groupedGroupFee.fee_group.name,
      };
    }
  }

  if (subcategoryId) {
    const [subcategoryFee, groupedSubcategoryFee] = await Promise.all([
    
      feeConfig(prisma).findUnique({
        where: {
          entity_type_entity_id: {
            entity_type: ENTITY_TYPES.SUBCATEGORY,
            entity_id: subcategoryId,
          },
        },
      }),
      feeGroupEntityConfig(prisma).findUnique({
        where: {
          entity_type_entity_id: {
            entity_type: ENTITY_TYPES.SUBCATEGORY,
            entity_id: subcategoryId,
          },
        },
        include: { fee_group: true },
      }),
    ]);
    if (subcategoryFee) {
      return {
        fee_percentage: Number(subcategoryFee.fee_percentage),
        source_level: ENTITY_TYPES.SUBCATEGORY,
        source_entity_id: subcategoryId,
        source_type: "single",
      };
    }
    if (groupedSubcategoryFee?.fee_group) {
      console.log(`Resolved platform fee from SUBCATEGORY FEE GROUP "${groupedSubcategoryFee.fee_group.name}" (ID: ${subcategoryId}): ${groupedSubcategoryFee.fee_group.fee_percentage}%`);
      return {
        fee_percentage: Number(groupedSubcategoryFee.fee_group.fee_percentage),
        source_level: ENTITY_TYPES.SUBCATEGORY,
        source_entity_id: subcategoryId,
        source_type: "group",
        source_group_id: groupedSubcategoryFee.fee_group.id,
        source_group_name: groupedSubcategoryFee.fee_group.name,
      };
    }
  }

  if (categoryId) {
    const [categoryFee, groupedCategoryFee] = await Promise.all([
      feeConfig(prisma).findUnique({
        where: {
          entity_type_entity_id: {
            entity_type: ENTITY_TYPES.CATEGORY,
            entity_id: categoryId,
          },
        },
      }),
      feeGroupEntityConfig(prisma).findUnique({
        where: {
          entity_type_entity_id: {
            entity_type: ENTITY_TYPES.CATEGORY,
            entity_id: categoryId,
          },
        },
        include: { fee_group: true },
      }),
    ]);
    if (categoryFee) {
      return {
        fee_percentage: Number(categoryFee.fee_percentage),
        source_level: ENTITY_TYPES.CATEGORY,
        source_entity_id: categoryId,
        source_type: "single",
      };
    }
    if (groupedCategoryFee?.fee_group) {
      return {
        fee_percentage: Number(groupedCategoryFee.fee_group.fee_percentage),
        source_level: ENTITY_TYPES.CATEGORY,
        source_entity_id: categoryId,
        source_type: "group",
        source_group_id: groupedCategoryFee.fee_group.id,
        source_group_name: groupedCategoryFee.fee_group.name,
      };
    }
  }

  return {
    fee_percentage: 0,
    source_level: null,
    source_entity_id: null,
    source_type: null,
  };
}

/**
 * Batch-resolve platform fees for multiple items.
 * Makes exactly 2 DB queries regardless of item count.
 * @param {Array<{groupId, subcategoryId, categoryId}>} items
 * @returns {Map<string, {fee_percentage, ...}>} key is `${groupId}|${subcategoryId}|${categoryId}`
 */
export async function batchResolvePlatformFees(items) {
  const groupIds = [...new Set(items.map((i) => i.groupId).filter(Boolean))];
  const subcategoryIds = [...new Set(items.map((i) => i.subcategoryId).filter(Boolean))];
  const categoryIds = [...new Set(items.map((i) => i.categoryId).filter(Boolean))];

  const conditions = [];
  if (groupIds.length > 0) conditions.push({ entity_type: 'group', entity_id: { in: groupIds } });
  if (subcategoryIds.length > 0) conditions.push({ entity_type: 'subcategory', entity_id: { in: subcategoryIds } });
  if (categoryIds.length > 0) conditions.push({ entity_type: 'category', entity_id: { in: categoryIds } });

  if (conditions.length === 0) {
    const resultMap = new Map();
    for (const item of items) {
      resultMap.set(`${item.groupId}|${item.subcategoryId}|${item.categoryId}`, { fee_percentage: 0, source_level: null, source_entity_id: null, source_type: null });
    }
    return resultMap;
  }

  const [directFees, groupEntityFees] = await Promise.all([
    feeConfig(prisma).findMany({ where: { OR: conditions, is_active: true } }),
    feeGroupEntityConfig(prisma).findMany({
      where: { OR: conditions },
      include: { fee_group: { select: { id: true, name: true, fee_percentage: true } } },
    }),
  ]);

  const directMap = new Map();
  for (const fee of directFees) directMap.set(`${fee.entity_type}:${fee.entity_id}`, fee);

  const groupMap = new Map();
  for (const gfe of groupEntityFees) groupMap.set(`${gfe.entity_type}:${gfe.entity_id}`, gfe);

  const resultMap = new Map();
  for (const item of items) {
    const key = `${item.groupId}|${item.subcategoryId}|${item.categoryId}`;
    if (resultMap.has(key)) continue;

    let resolved = null;

    if (item.groupId) {
      const df = directMap.get(`group:${item.groupId}`);
      if (df) {
        resolved = { fee_percentage: Number(df.fee_percentage), source_level: 'group', source_entity_id: item.groupId, source_type: 'single' };
      } else {
        const gfe = groupMap.get(`group:${item.groupId}`);
        if (gfe?.fee_group) {
          resolved = { fee_percentage: Number(gfe.fee_group.fee_percentage), source_level: 'group', source_entity_id: item.groupId, source_type: 'group', source_group_id: gfe.fee_group.id, source_group_name: gfe.fee_group.name };
        }
      }
    }

    if (!resolved && item.subcategoryId) {
      const df = directMap.get(`subcategory:${item.subcategoryId}`);
      if (df) {
        resolved = { fee_percentage: Number(df.fee_percentage), source_level: 'subcategory', source_entity_id: item.subcategoryId, source_type: 'single' };
      } else {
        const gfe = groupMap.get(`subcategory:${item.subcategoryId}`);
        if (gfe?.fee_group) {
          resolved = { fee_percentage: Number(gfe.fee_group.fee_percentage), source_level: 'subcategory', source_entity_id: item.subcategoryId, source_type: 'group', source_group_id: gfe.fee_group.id, source_group_name: gfe.fee_group.name };
        }
      }
    }

    if (!resolved && item.categoryId) {
      const df = directMap.get(`category:${item.categoryId}`);
      if (df) {
        resolved = { fee_percentage: Number(df.fee_percentage), source_level: 'category', source_entity_id: item.categoryId, source_type: 'single' };
      } else {
        const gfe = groupMap.get(`category:${item.categoryId}`);
        if (gfe?.fee_group) {
          resolved = { fee_percentage: Number(gfe.fee_group.fee_percentage), source_level: 'category', source_entity_id: item.categoryId, source_type: 'group', source_group_id: gfe.fee_group.id, source_group_name: gfe.fee_group.name };
        }
      }
    }

    resultMap.set(key, resolved || { fee_percentage: 0, source_level: null, source_entity_id: null, source_type: null });
  }
  return resultMap;
}

export async function getPlatformFeeByProductId(productId) {
  const product = await prisma.products.findUnique({
    where: { id: productId },
    select: {
      id: true,
      category_id: true,
      subcategory_id: true,
      group_id: true,
      variants: {
        where: { active: true },
        orderBy: { price: "asc" },
        select: { id: true, price: true },
        take: 1,
      },
    },
  });

  if (!product) {
    throw new Error("Product not found");
  }

  const fee = await resolveApplicablePlatformFee({
    categoryId: product.category_id,
    subcategoryId: product.subcategory_id,
    groupId: product.group_id,
  });

  const basePrice = product.variants?.[0]?.price ? Number(product.variants[0].price) : 0;
  const platformFeeAmount = (basePrice * fee.fee_percentage) / 100;
  const sellerEarnings = basePrice - platformFeeAmount;

  return {
    product_id: product.id,
    fee_percentage: fee.fee_percentage,
    fee_source_level: fee.source_level,
    fee_source_entity_id: fee.source_entity_id,
    fee_source_type: fee.source_type || null,
    fee_source_group_id: fee.source_group_id || null,
    fee_source_group_name: fee.source_group_name || null,
    base_price: basePrice,
    platform_fee_amount: Number(platformFeeAmount.toFixed(2)),
    seller_earnings: Number(sellerEarnings.toFixed(2)),
  };
}

export async function listPlatformFees() {
  const rows = await feeConfig(prisma).findMany({
    where: { is_active: true },
    orderBy: [{ entity_type: "asc" }, { created_at: "desc" }],
  });

  return rows.map((row) => ({
    ...row,
    fee_percentage: Number(row.fee_percentage),
  }));
}

export const PlatformFeeEntityType = ENTITY_TYPES;
